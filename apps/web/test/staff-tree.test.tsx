import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StaffTree, staffLevels } from "@/components/app/staff-tree";
import type { User } from "@/lib/types";

const u = (id: number, role: string, active = true) => ({ id, name: `U${id}`, username: `u${id}`, phone: null, role, commission_pct: null, sort_order: id, active, can_add_expense: false, avatar_url: null, created_at: 0 }) as unknown as User;

describe("staff tree", () => {
  it("orders owner, admins, then barbers, inactive last", () => {
    const levels = staffLevels([u(3, "barber", false), u(4, "barber"), u(2, "admin"), u(1, "owner")]);
    expect(levels.map((l) => l.title)).toEqual(["Owner", "Admins", "Barbers"]);
    expect(levels[2]!.users.map((x) => x.id)).toEqual([4, 3]);
  });
  it("skips empty levels and renders every person", () => {
    render(<StaffTree users={[u(1, "owner"), u(5, "barber")]} node={(x) => <p>{x.name}</p>} />);
    expect(screen.queryByText("Admins")).toBeNull();
    expect(screen.getByText("U1")).toBeTruthy();
    expect(screen.getByText("U5")).toBeTruthy();
  });
});
