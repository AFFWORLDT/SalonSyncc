import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { Features } from "@/components/features";

vi.mock("@paper-design/shaders-react", () => ({ Warp: () => null }));
vi.stubGlobal("matchMedia", (q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} }));

describe("features", () => {
  it("each card has Learn more, which opens its details", async () => {
    render(<Features />);
    const buttons = screen.getAllByRole("button", { name: /Learn more/ });
    expect(buttons).toHaveLength(6);
    fireEvent.click(buttons[3]);
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Visit reminders")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Start your 7-day free trial" }).getAttribute("href")).toMatch(/^\/signup\/?$/);
  });
});
