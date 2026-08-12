import { describe, it, expect } from "vitest";
// Raw imports rather than fs, so this stays a browser-typed project.
import viteConfig from "../../vite.config.ts?raw";
import mainTsx from "../main.tsx?raw";
import useAppUpdate from "../pwa/useAppUpdate.ts?raw";

/**
 * A tab left open for days used to sit several releases behind with nothing on
 * screen to say so — the service worker kept serving its cached build. These
 * pin the pieces that make a stale build visible, because every one of them
 * fails silently: no error, no crash, just an old app.
 */

describe("stale-build prompt", () => {
  it("opts out of the plugin's own registration script", () => {
    // That script is what silently served the cached build to an open tab and
    // never said a word about it.
    expect(viteConfig).toMatch(/injectRegister:\s*null/);
  });

  it("registers the worker from app code so it can surface the prompt", () => {
    // The auto-injected registerSW.js has no hook to tell the UI anything.
    expect(viteConfig).toMatch(/injectRegister:\s*null/);
    expect(useAppUpdate).toMatch(/navigator\.serviceWorker\.register\(/);
  });

  it("does not use registerSW(), which reloads the page behind our back", () => {
    // virtual:pwa-register installs a "controlling -> location.reload()"
    // listener. With skipWaiting that fires on its own and yanks the page away
    // mid-entry — the exact thing this banner exists to avoid.
    // Matches the import specifically — the comment above explains why we
    // avoid it, and should not itself trip the check.
    expect(useAppUpdate).not.toMatch(/from "virtual:pwa-register"/);
  });

  it("activates on install so a stale client is never stranded", () => {
    // Letting the worker WAIT strands anyone whose page predates the banner:
    // nothing on that page can activate it, so no amount of reloading helps.
    expect(viteConfig).toMatch(/skipWaiting:\s*true/);
    expect(viteConfig).toMatch(/clientsClaim:\s*true/);
  });

  it("only announces an update when a worker was already in charge", () => {
    // clientsClaim fires controllerchange on a first visit too; without this
    // guard every new visitor is told a new version is ready.
    expect(useAppUpdate).toMatch(/hadControllerAtLoad/);
  });

  it("holds the registration at module scope, not per-component", () => {
    // registerSW() only fires onRegisteredSW for the first call, and StrictMode
    // mounts twice — a per-component ref left the surviving mount with no
    // registration, so the update check silently did nothing.
    expect(useAppUpdate).toMatch(/^let registration/m);
    expect(useAppUpdate).toMatch(/if \(started\) return;/);
  });

  it("activates the waiting worker itself rather than via updateSW()", () => {
    // The library helper resolved the waiting worker from its own state and
    // armed the reload without ever sending the message: the button did
    // nothing. Verified end-to-end that messaging it directly does reload.
    expect(useAppUpdate).toMatch(/postMessage\(\{ type: "SKIP_WAITING" \}\)/);
    expect(useAppUpdate).toMatch(/controllerchange/);
  });

  it("keeps checking while a long-lived tab stays open", () => {
    // The original failure was precisely a tab that never navigated again:
    // without these, the browser never looks for a new worker.
    expect(useAppUpdate).toMatch(/setInterval/);
    expect(useAppUpdate).toMatch(/visibilitychange/);
  });

  it("mounts the banner above the auth gate", () => {
    // Mounted inside Root it would be invisible on the sign-in and pending
    // screens, which are exactly where a stuck user waits.
    expect(mainTsx).toMatch(/<UpdateBanner \/>/);
    expect(mainTsx).toMatch(/import \{ UpdateBanner \}/);
  });
});
