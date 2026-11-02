import { describe, it, expect } from "vitest";
import { salonFromHost } from "@/lib/host";

describe("login host", () => {
  it("asks for the salon ID on workers.dev and localhost", () => {
    expect(salonFromHost("salonkit-app.affworld0.workers.dev", "")).toBeNull();
    expect(salonFromHost("localhost:8787", "")).toBeNull();
    expect(salonFromHost("localhost:8787", "salonkit.online")).toBeNull();
  });
  it("takes the salon from its own subdomain", () => {
    expect(salonFromHost("superbeard.salonkit.online", "salonkit.online")).toBe("superbeard");
    expect(salonFromHost("SuperBeard.SalonKit.online:443", "salonkit.online")).toBe("superbeard");
    expect(salonFromHost("salonkit.online", "salonkit.online")).toBeNull();
    expect(salonFromHost("a.b.salonkit.online", "salonkit.online")).toBeNull();
  });
});
