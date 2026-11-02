import { describe, it, expect } from "vitest";
import { LOGIN_SCENES, pickScene } from "@/lib/login-scenes";
import { existsSync } from "node:fs";
import { join } from "node:path";

describe("login scenes", () => {
  it("every scene has its photo and 5 mesh colours", () => {
    for (const s of LOGIN_SCENES) {
      expect(existsSync(join(__dirname, "..", "public", s.src))).toBe(true);
      expect(s.mesh).toHaveLength(5);
    }
  });
  it("never shows the same photo twice in a row", () => {
    localStorage.clear();
    const a = pickScene(() => 0.1);
    const b = pickScene(() => 0.1);
    expect(b).not.toBe(a);
  });
});
