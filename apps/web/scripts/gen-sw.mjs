// Writes public/firebase-messaging-sw.js from the NEXT_PUBLIC_FIREBASE_* build env (one SalonStation Firebase project).
// Without the full config the service worker is a no-op and the app never asks for push permission.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const FIREBASE_KEYS = ["API_KEY", "AUTH_DOMAIN", "PROJECT_ID", "STORAGE_BUCKET", "MESSAGING_SENDER_ID", "APP_ID"];

export function firebaseConfig(env = process.env) {
  const v = Object.fromEntries(FIREBASE_KEYS.map((k) => [k, env[`NEXT_PUBLIC_FIREBASE_${k}`] ?? ""]));
  if (Object.values(v).some((x) => !x)) return null;
  return { apiKey: v.API_KEY, authDomain: v.AUTH_DOMAIN, projectId: v.PROJECT_ID, storageBucket: v.STORAGE_BUCKET, messagingSenderId: v.MESSAGING_SENDER_ID, appId: v.APP_ID };
}

export function serviceWorker(cfg) {
  if (!cfg) return "// Push is not configured for this build (NEXT_PUBLIC_FIREBASE_* unset).\nself.addEventListener(\"install\", () => self.skipWaiting());\n";
  // Same behaviour as FM's worker: Firebase draws background notifications from webpush.notification and opens
  // fcm_options.link; notifications raised from the foreground carry data.url and are focused/opened here.
  return `importScripts("https://www.gstatic.com/firebasejs/13.1.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/13.1.0/firebase-messaging-compat.js");
firebase.initializeApp(${JSON.stringify(cfg)});
firebase.messaging();
self.addEventListener("notificationclick", (event) => {
  const url = event.notification && event.notification.data && event.notification.data.url;
  if (!url) return;
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL(url, self.location.origin).href;
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const open = all.find((c) => c.url.startsWith(self.location.origin));
    if (open) {
      await open.focus();
      if ("navigate" in open) await open.navigate(target).catch(() => {});
    } else {
      await self.clients.openWindow(target);
    }
  })());
});
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = new URL("../public/firebase-messaging-sw.js", import.meta.url);
  writeFileSync(out, serviceWorker(firebaseConfig()));
}
