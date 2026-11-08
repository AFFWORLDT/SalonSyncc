/**
 * Proof that https://<salon>.salonkit.online/l/… links belong to the phone app, so tapping a sign-in or invite link
 * opens SalonKit directly (Android App Links, iOS Universal Links). Served on the bare domain too: both platforms
 * check a wildcard host (*.salonkit.online) against the root. ANDROID_CERT_SHA256 lists the signing certificates
 * (upload key, and Google Play's app-signing key once known), comma separated.
 */
import { Hono } from "hono";
import type { AppEnv } from "../env";

export const appLinks = new Hono<AppEnv>();

const ANDROID_PACKAGE = "online.salonkit.app";
const IOS_APP_ID = "98843335NN.online.salonkit.app";
const LINK_PATHS = ["/l/*"];

appLinks.get("/.well-known/assetlinks.json", (c) => {
  const certs = (c.env.ANDROID_CERT_SHA256 ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  c.header("Cache-Control", "public, max-age=3600");
  return c.json([
    { relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: ANDROID_PACKAGE, sha256_cert_fingerprints: certs } },
  ]);
});

appLinks.get("/.well-known/apple-app-site-association", (c) => {
  c.header("Cache-Control", "public, max-age=3600");
  return c.json({ applinks: { apps: [], details: [{ appIDs: [IOS_APP_ID], components: LINK_PATHS.map((p) => ({ "/": p })) }] } });
});
