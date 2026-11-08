import { describe, it, expect } from "vitest";
import { firebaseAuthProxyTarget } from "../src/lib/firebase-auth-proxy";

const t = (u: string) => firebaseAuthProxyTarget(new URL(u), "salonkit.online", "salonkit1");

describe("Firebase Auth pages on salonkit.online", () => {
  it("passes /__/auth/ and /__/firebase/ on the apex and www to firebaseapp.com, query kept", () => {
    expect(t("https://salonkit.online/__/auth/handler?apiKey=x&mode=signIn")).toBe("https://salonkit1.firebaseapp.com/__/auth/handler?apiKey=x&mode=signIn");
    expect(t("https://www.salonkit.online/__/auth/iframe")).toBe("https://salonkit1.firebaseapp.com/__/auth/iframe");
    expect(t("https://salonkit.online/__/firebase/init.json")).toBe("https://salonkit1.firebaseapp.com/__/firebase/init.json");
  });
  it("never on a salon's address, other paths, or without settings", () => {
    expect(t("https://fmsalon.salonkit.online/__/auth/handler")).toBeNull();
    expect(t("https://salonkit.online/__/other")).toBeNull();
    expect(t("https://salonkit.online/api/public/auth-config")).toBeNull();
    expect(t("https://salonkit.online.evil.com/__/auth/handler")).toBeNull();
    expect(firebaseAuthProxyTarget(new URL("https://salonkit.online/__/auth/handler"), undefined, "salonkit1")).toBeNull();
  });
});
