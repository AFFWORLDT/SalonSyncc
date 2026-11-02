import { describe, it, expect } from "vitest";
import { firebaseWebConfig } from "@/lib/firebase-config";
import { PUSH_CONFIGURED, startPush, pushState } from "@/lib/push";
import { firebaseConfig as fc, serviceWorker } from "../scripts/gen-sw.mjs";

const firebaseConfig = (e: Record<string, string>) => fc(e as unknown as NodeJS.ProcessEnv);

const env = {
  NEXT_PUBLIC_FIREBASE_API_KEY: "k",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "ss.firebaseapp.com",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "salonstation-test",
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "b",
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "1",
  NEXT_PUBLIC_FIREBASE_APP_ID: "a",
};

describe("push configuration", () => {
  it("needs every Firebase value", () => {
    expect(firebaseWebConfig(env)?.projectId).toBe("salonstation-test");
    expect(firebaseWebConfig({ ...env, NEXT_PUBLIC_FIREBASE_APP_ID: "" })).toBeNull();
  });
  it("without the build config push is off and starting it does nothing", async () => {
    expect(PUSH_CONFIGURED).toBe(false);
    expect(await pushState()).toBe("unsupported");
    const stop = await startPush(() => {});
    expect(typeof stop).toBe("function");
  });
  it("the generated service worker uses the env project and no FM values", () => {
    const sw = serviceWorker(firebaseConfig(env));
    expect(sw).toContain("salonstation-test");
    expect(sw).not.toMatch(/fm-salon|FM Salon/);
    expect(serviceWorker(firebaseConfig({}))).toContain("not configured");
  });
});
