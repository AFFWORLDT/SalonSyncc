import { describe, it, expect } from "vitest";
import { applyKey } from "@/lib/numpad";

const type = (keys: string[], decimals = 2, mode: "money" | "digits" = "money") => keys.reduce((v, k) => applyKey(v, k, mode, false, decimals), "");

describe("number pad", () => {
  it("FM rules for a 2-decimal currency", () => {
    expect(type(["1", "2", ".", "5", "0", "9"])).toBe("12.50");
    expect(type(["0", "0", "7"])).toBe("7");
    expect(type([".", "5"])).toBe("0.5");
    expect(type(["1", ".", ".", "2"])).toBe("1.2");
    expect(type(["9", "9", "9", "9", "9", "9", "9"])).toBe("999999");
    expect(type(["1", "2", "⌫"])).toBe("1");
    expect(type(["1", "C"])).toBe("");
    expect(applyKey("55", "3", "money", true, 2)).toBe("3");
  });
  it("3 decimals", () => expect(type(["1", ".", "2", "3", "4", "5"], 3)).toBe("1.234"));
  it("0 decimals rejects the point", () => expect(type(["1", ".", "5"], 0)).toBe("15"));
  it("digits mode", () => expect(type(["0", "5", "0", "1"], 2, "digits")).toBe("0501"));
});
