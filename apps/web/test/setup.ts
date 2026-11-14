import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

// next/font only works inside the Next compiler: fonts become plain class names here.
vi.mock("next/font/google", () => ({ Manrope: () => ({ className: "", variable: "", style: { fontFamily: "" } }) }));

afterEach(() => {
  cleanup();
  try {
    localStorage.clear();
  } catch {
    /* jsdom without storage */
  }
});
