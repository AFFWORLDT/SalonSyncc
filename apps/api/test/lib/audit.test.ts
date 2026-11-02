import { describe, expect, it } from "vitest";
import { changedFields, userSnapshot } from "../../src/lib/audit";

describe("audit helpers", () => {
  it("changedFields", () => {
    expect(changedFields({ a: 1, b: [1] }, { a: 1, b: [2] })).toEqual(["b"]);
    expect(changedFields(null, { a: 1 })).toEqual(["a"]);
    expect(changedFields({ a: 1 }, null)).toEqual(["a"]);
    expect(changedFields({ a: 1, n: null }, { a: 1, n: null })).toEqual([]);
    expect(changedFields({ b: 1, a: 1 }, { b: 2, a: 2 })).toEqual(["a", "b"]);
  });
  it("userSnapshot strips secrets", () => {
    const u = userSnapshot({ id: 1, name: "A", password_hash: "x", avatar: "y", avatar_type: "image/webp", session_version: 3 });
    expect("password_hash" in u).toBe(false);
    expect("avatar" in u).toBe(false);
    expect("avatar_type" in u).toBe(false);
    expect("session_version" in u).toBe(false);
    expect(u.name).toBe("A");
  });
});
