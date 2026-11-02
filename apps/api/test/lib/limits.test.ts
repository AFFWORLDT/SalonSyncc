import { describe, expect, it } from "vitest";
import { isLocked, LOGIN_WINDOW_MS, loginLimits, minuteWindow, PUBLIC_LIMITS } from "../../src/lib/limits";

describe("limits", () => {
  it("loginLimits: three counters, org-scoped usernames", () => {
    expect(loginLimits("org1", "admin", "1.2.3.4")).toEqual([
      { key: "login-ip:1.2.3.4", max: 20 },
      { key: "u:org1:admin|1.2.3.4", max: 8 },
      { key: "u:org1:admin", max: 50 },
    ]);
    expect(loginLimits("org2", "admin", "1.2.3.4")[2]!.key).not.toBe(loginLimits("org1", "admin", "1.2.3.4")[2]!.key);
  });
  it("isLocked is count >= max", () => {
    expect(isLocked(7, 8)).toBe(false);
    expect(isLocked(8, 8)).toBe(true);
    expect(isLocked(99, 8)).toBe(true);
    expect(isLocked(0, 8)).toBe(false);
  });
  it("window and public limits", () => {
    expect(LOGIN_WINDOW_MS).toBe(900_000);
    expect(PUBLIC_LIMITS).toEqual({ pub: 60, pdf: 10 });
    const t = 1_800_000_000_000;
    expect(minuteWindow(t)).toBe(minuteWindow(t + 59_999 - (t % 60_000)));
    expect(minuteWindow(t)).not.toBe(minuteWindow(t + 60_000));
  });
});
