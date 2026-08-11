import { useCallback, useEffect, useState } from "react";
import { registerSW } from "virtual:pwa-register";

/** How often to ask the server whether a new build exists, while the tab is open. */
const POLL_MS = 60 * 60 * 1000;
/** If the new worker doesn't take control, reload anyway rather than hang. */
const HANDOVER_TIMEOUT_MS = 3000;

/*
 * Registration lives at module scope, not in the hook.
 *
 * registerSW() is not safe to call twice — the second call returns without
 * firing onRegisteredSW — and StrictMode mounts every effect twice. Holding
 * this per-component meant the surviving mount never received the
 * registration, so the update check silently did nothing.
 */
let registration: ServiceWorkerRegistration | null = null;
let started = false;
let updateReady = false;
const subscribers = new Set<() => void>();

function ensureRegistered() {
  if (started) return;
  started = true;
  registerSW({
    onNeedRefresh: () => {
      updateReady = true;
      subscribers.forEach((notify) => notify());
    },
    onRegisteredSW: (_url, reg) => { registration = reg ?? null; },
  });
}

/** Never blocks rendering: a failed check just means no prompt this time. */
function checkForUpdate() {
  void registration?.update().catch(() => {});
}

/**
 * Reports when a newer build is cached and waiting.
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
   * Activates the waiting worker, then reloads once it has taken control.
   *
   * We message the worker directly rather than using the updateSW() helper
   * registerSW returns: that helper resolves the waiting worker from state
   * internal to the library, and the double registration left it looking at
   * the wrong one — it armed the reload but never sent the message, so the
   * button did nothing.
   */
  const reload = useCallback(() => {
    const waiting = registration?.waiting;
    // Nothing staged (or no worker at all) — a plain reload is still correct.
    if (!waiting) { window.location.reload(); return; }

    let done = false;
    const go = () => { if (!done) { done = true; window.location.reload(); } };
    navigator.serviceWorker.addEventListener("controllerchange", go, { once: true });
    setTimeout(go, HANDOVER_TIMEOUT_MS);

    waiting.postMessage({ type: "SKIP_WAITING" });
  }, []);

  return { needRefresh, reload };
}
