import { describe, it, expect, vi, afterEach } from "vitest";
import { api, ApiError, onApiEvent, isStale } from "@/lib/api";

const reply = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));
afterEach(() => vi.unstubAllGlobals());

describe("api client", () => {
  it("keeps the API's code on errors", async () => {
    vi.stubGlobal("fetch", reply(409, { error: "Changed", code: "stale" }));
    const err = await api("/api/sales/1", { method: "PUT", body: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: "stale", message: "Changed" });
    expect(isStale(err)).toBe(true);
  });
  it("emits subscription_inactive on 402 and feature_disabled on 403", async () => {
    const seen: string[] = [];
    const off = onApiEvent((k) => seen.push(k));
    vi.stubGlobal("fetch", reply(402, { error: "x", code: "subscription_inactive" }));
    await api("/api/sales", { body: {} }).catch(() => {});
    vi.stubGlobal("fetch", reply(403, { error: "x", code: "feature_disabled" }));
    await api("/api/ledger/shop").catch(() => {});
    vi.stubGlobal("fetch", reply(403, { error: "no access" }));
    await api("/api/users").catch(() => {});
    off();
    expect(seen).toEqual(["subscription_inactive", "feature_disabled"]);
  });
  it("401 wrong_org clears cached sessions and redirects to /login/", async () => {
    localStorage.setItem("ss_session_cache:alpha", "{}");
    localStorage.setItem("ss_ui_prefs", "keep");
    window.history.pushState({}, "", "/sales/");
    vi.stubGlobal("fetch", reply(401, { error: "Please sign in", code: "wrong_org" }));
    await api("/api/sales").catch(() => {});
    expect(localStorage.getItem("ss_session_cache:alpha")).toBeNull();
    expect(localStorage.getItem("ss_ui_prefs")).toBe("keep");
  });
  it("a 401 on the login page does not redirect", async () => {
    window.history.pushState({}, "", "/login/");
    const before = window.location.href;
    vi.stubGlobal("fetch", reply(401, { error: "Wrong salon ID, username or password" }));
    const err = (await api("/api/auth/login", { body: {} }).catch((e) => e)) as Error;
    expect(err.message).toBe("Wrong salon ID, username or password");
    expect(window.location.href).toBe(before);
  });
});
