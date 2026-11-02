/**
 * Push notifications through Firebase Cloud Messaging.
 *
 * The phone/browser asks permission once, Firebase gives this device a token, and we hand it to our API
 * (POST /api/push/tokens) so the Worker can send to it. Firebase is loaded lazily, only when needed.
 * The service worker that shows notifications in the background is /firebase-messaging-sw.js.
 *
 * iPhone: web push only works when the app was added to the Home Screen (iOS 16.4+).
 */
import { api } from "@/lib/api";

/** Public web config of the Firebase project "fm-salon-app" (safe to ship; it only identifies the project). */
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyBBs6uskXPhfFfl8uUArVrH68JwOJ8g_8o",
  authDomain: "fm-salon-app.firebaseapp.com",
  projectId: "fm-salon-app",
  storageBucket: "fm-salon-app.firebasestorage.app",
  messagingSenderId: "923048894140",
  appId: "1:923048894140:web:e77825768e83f61a09fab9",
};

const TOKEN_KEY = "fm_push_token";
const OPTOUT_KEY = "fm_push_optout"; // set when the user turns notifications off here, so the home screen stops auto-asking.

/** Web Push certificate "Key pair" (public VAPID key) from Firebase → Cloud Messaging. Public: identifies the project. */
const VAPID_KEY = "BF4WmhZLO9Oi4OFQGp0MzddleViaPbB32ZapWjE1YQ_VLJwblWsfKdl4dGQ9VuOa0D3FmcMnNWafoXshfyWuUmE";

export type PushState = "unsupported" | "needs-install" | "blocked" | "off" | "on";

async function messaging() {
  const [{ initializeApp, getApps }, m] = await Promise.all([import("firebase/app"), import("firebase/messaging")]);
  const app = getApps()[0] ?? initializeApp(FIREBASE_CONFIG);
  return { m, messaging: m.getMessaging(app) };
}

function savedToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
function saveToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

function setOptOut(v: boolean) {
  try {
    if (v) localStorage.setItem(OPTOUT_KEY, "1");
    else localStorage.removeItem(OPTOUT_KEY);
  } catch {}
}
/** True when the user turned notifications off on this device — the home screen then won't auto-ask again. */
export function pushOptedOut(): boolean {
  try {
    return localStorage.getItem(OPTOUT_KEY) === "1";
  } catch {
    return false;
  }
}

const isIos = () => /iP(hone|ad|od)/.test(navigator.userAgent);
const isInstalled = () => matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

/** Where this device stands, for the Notifications switch. */
export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined" || !("Notification" in window) || !("serviceWorker" in navigator)) {
    return isIos() && !isInstalled() ? "needs-install" : "unsupported";
  }
  const { isSupported } = await import("firebase/messaging");
  if (!(await isSupported())) return isIos() && !isInstalled() ? "needs-install" : "unsupported";
  if (Notification.permission === "denied") return "blocked";
  return Notification.permission === "granted" && savedToken() ? "on" : "off";
}

/** Gets (or refreshes) this device's token and registers it for the signed-in user. */
async function register(): Promise<void> {
  const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
  const { m, messaging: msg } = await messaging();
  const token = await m.getToken(msg, { vapidKey: VAPID_KEY, serviceWorkerRegistration: reg });
  if (!token) throw new Error("Couldn't turn on notifications on this device");
  await api("/api/push/tokens", { body: { token } });
  saveToken(token);
}

/** Asks permission (must run from a tap) and turns notifications on for this device. */
export async function enablePush(): Promise<void> {
  const perm = await Notification.requestPermission();
  if (perm !== "granted") throw new Error("Notifications are blocked. Allow them for this site in the browser settings.");
  await register();
  setOptOut(false);
}

/**
 * Home-screen auto-setup: make sure this device is registered for notifications.
 * Asks for permission by default, but never overrides a user who turned it off here (opt-out),
 * nor one the browser has blocked. Returns the resulting state. Safe to call on every home visit.
 */
export async function ensurePushEnabled(): Promise<PushState> {
  const state = await pushState();
  if (state === "off" && !pushOptedOut() && Notification.permission !== "denied") {
    await enablePush(); // throws if the prompt is dismissed; callers treat that as "still off".
    return pushState();
  }
  return state;
}

/** Turns notifications off for this device. */
export async function disablePush(): Promise<void> {
  const token = savedToken();
  saveToken(null);
  setOptOut(true); // remember the choice so the home screen doesn't turn it back on.
  try {
    const { m, messaging: msg } = await messaging();
    await m.deleteToken(msg);
  } catch {}
  if (token) await api("/api/push/tokens", { method: "DELETE", body: { token }, redirectOn401: false }).catch(() => {});
}

/** Before signing out: stop this device getting the old user's notifications. */
export async function forgetPushToken(): Promise<void> {
  const token = savedToken();
  if (token) await api("/api/push/tokens", { method: "DELETE", body: { token }, redirectOn401: false }).catch(() => {});
}

/**
 * After sign-in on a device that already allowed notifications: re-register (tokens rotate, and the device may
 * now belong to a different user), and show notifications that arrive while the app is open as toasts.
 */
export async function startPush(onForeground: (title: string, body: string) => void): Promise<() => void> {
  if ((await pushState()) !== "on") return () => {};
  await register().catch(() => {});
  const { m, messaging: msg } = await messaging();
  const reg = await navigator.serviceWorker.ready.catch(() => null);
  return m.onMessage(msg, (p) => {
    const title = p.notification?.title ?? "FM Salon";
    const body = p.notification?.body ?? "";
    // In-app toast for immediate context while you're looking at the app…
    onForeground(title, body);
    // …and a real browser/OS notification too (FCM suppresses its own while the tab is focused).
    try {
      const data = p.data as { link?: string } | undefined;
      reg?.showNotification(title, {
        body,
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        tag: p.messageId,
        data: { url: p.fcmOptions?.link ?? data?.link ?? "/" },
      });
    } catch {
      /* some browsers block showNotification from a focused page — the toast still shows */
    }
  });
}
