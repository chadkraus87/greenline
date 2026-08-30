/**
 * Bill reminders through the operating system.
 *
 * An in-app toast only helps someone already looking at the app, which is not
 * where a forgotten bill gets forgotten.
 */

const SEEN_KEY = "gl-notified";

export const notificationsSupported = (): boolean =>
  typeof window !== "undefined" && "Notification" in window;

export const notificationPermission = (): NotificationPermission | "unsupported" =>
  notificationsSupported() ? Notification.permission : "unsupported";

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!notificationsSupported()) return "unsupported";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

/** Notifications already shown, so a reminder fires once per bill per day. */
function seen(): Record<string, boolean> {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || "{}") as Record<string, boolean>;
  } catch {
    return {};
  }
}

function remember(key: string): void {
  try {
    const all = seen();
    all[key] = true;
    // Keep it from growing without bound — a few hundred keys is plenty.
    const keys = Object.keys(all);
    if (keys.length > 400) for (const k of keys.slice(0, keys.length - 200)) delete all[k];
    localStorage.setItem(SEEN_KEY, JSON.stringify(all));
  } catch { /* storage disabled — worst case a reminder repeats */ }
}

/**
 * Shows one reminder, at most once per key.
 * Returns whether it actually fired.
 */
export function notifyOnce(key: string, title: string, body: string): boolean {
  if (!notificationsSupported() || Notification.permission !== "granted") return false;
  if (seen()[key]) return false;
  try {
    new Notification(title, { body, icon: "/icon.svg", tag: key });
    remember(key);
    return true;
  } catch {
    return false;
  }
}
