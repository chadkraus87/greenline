import { useCallback, useEffect, useState } from "react";

/** How often to ask the server whether a new build exists, while the tab is open. */
const POLL_MS = 60 * 60 * 1000;
/** If the new worker doesn't take control, reload anyway rather than hang. */
const HANDOVER_TIMEOUT_MS = 3000;
/** vite-plugin-pwa emits the worker here. */
const SW_URL = "/sw.js";

/*
 * Registered with plain browser APIs rather than registerSW() from
 * virtual:pwa-register.
 *
 * That helper carries state we can't see, and it cost us twice: it only fires
 * onRegisteredSW for the first of StrictMode's two calls, and it quietly
 * installs a "controlling -> location.reload()" listener that yanked the page
 * out from under the user the moment the worker activated. The lifecycle we
 * need here is four events long — owning it is cheaper than working around it.
 */
let registration: ServiceWorkerRegistration | null = null;
let started = false;
let updateReady = false;
const subscribers = new Set<() => void>();

/*
 * Whether a worker was already in charge when this page loaded.
 *
 * The worker claims clients as soon as it installs, which fires
 * controllerchange on a first visit too. Without this, every new visitor would
 * be told a new version is ready before they ever had an old one.
 */
const hadControllerAtLoad =
  typeof navigator !== "undefined" && !!navigator.serviceWorker?.controller;

function announce() {
  if (updateReady) return;
  updateReady = true;
  subscribers.forEach((notify) => notify());
}

function ensureRegistered() {
  if (started) return;
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  // No worker is generated in dev, so registering would just 404.
  if (!import.meta.env.PROD) return;
  started = true;

  // The worker calls skipWaiting, so this is the normal path: a new one has
  // taken over and the page is now running code older than its own cache.
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (hadControllerAtLoad) announce();
  });

  void navigator.serviceWorker.register(SW_URL, { scope: "/" })
    .then((reg) => {
      registration = reg;
      // Covers a worker that installed but hasn't taken over yet.
      if (reg.waiting && navigator.serviceWorker.controller) announce();
      reg.addEventListener("updatefound", () => {
        const incoming = reg.installing;
        if (!incoming) return;
        incoming.addEventListener("statechange", () => {
          // "installed" with a controller present means an update, not a
          // first install.
          if (incoming.state === "installed" && navigator.serviceWorker.controller) announce();
        });
      });
    })
    .catch(() => { /* No worker means no offline cache — the app still works. */ });
}

/** Never blocks rendering: a failed check just means no prompt this time. */
function checkForUpdate() {
  void registration?.update().catch(() => {});
}

/**
 * Reports when a newer build has been fetched and is ready to be used.
 *
 * Greenline is a PWA, so the service worker serves the app from cache. The
 * browser only looks for a new one on navigation — which means a tab left open
 * for days never notices a deploy. That is exactly how a tab ended up several
 * releases behind, missing whole features, with nothing on screen to say so.
 *
 * So we also check on a timer and whenever the tab is brought back into focus.
 */
export function useAppUpdate() {
  // Seeded from module state in case the update landed before we subscribed.
  const [needRefresh, setNeedRefresh] = useState(updateReady);

  useEffect(() => {
    ensureRegistered();

    const notify = () => setNeedRefresh(true);
    subscribers.add(notify);

    const timer = setInterval(checkForUpdate, POLL_MS);
    // Coming back to a tab left open overnight is the common case.
    const onVisible = () => { if (document.visibilityState === "visible") checkForUpdate(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      subscribers.delete(notify);
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  /**
   * Loads the new build. Usually the worker is already in charge and this is
   * just a reload; if one is still waiting, we activate it first.
   */
  const reload = useCallback(() => {
    const waiting = registration?.waiting;
    if (!waiting) { window.location.reload(); return; }

    let done = false;
    const go = () => { if (!done) { done = true; window.location.reload(); } };
    navigator.serviceWorker.addEventListener("controllerchange", go, { once: true });
    setTimeout(go, HANDOVER_TIMEOUT_MS);

    waiting.postMessage({ type: "SKIP_WAITING" });
  }, []);

  return { needRefresh, reload };
}
