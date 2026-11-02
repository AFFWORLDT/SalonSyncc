import { describe, it, expect } from "vitest";
import { salonFromHost } from "@/lib/host";

describe("login host", () => {
  it("asks for the salon ID on workers.dev and localhost", () => {
    expect(salonFromHost("salonstation-app.affworld0.workers.dev", "")).toBeNull();
    expect(salonFromHost("localhost:8787", "")).toBeNull();
    expect(salonFromHost("localhost:8787", "salonstation.online")).toBeNull();
  });
  it("takes the salon from its own subdomain", () => {
    expect(salonFromHost("superbeard.salonstation.online", "salonstation.online")).toBe("superbeard");
    expect(salonFromHost("SuperBeard.SalonStation.online:443", "salonstation.online")).toBe("superbeard");
    expect(salonFromHost("salonstation.online", "salonstation.online")).toBeNull();
    expect(salonFromHost("a.b.salonstation.online", "salonstation.online")).toBeNull();
  });
});
