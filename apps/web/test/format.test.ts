import { describe, it, expect, afterEach } from "vitest";
import { setFormat, money, num, toInput, fromInput, businessDay, splitPhone, whatsappDigits, minorDigits } from "@/lib/format";

const base = { currency: "AED", currency_minor: 100, locale: "en-AE", timezone: "Asia/Dubai", day_start_hour: 4, phone_country: "971" };
afterEach(() => setFormat(null));

describe("money per salon", () => {
  it("2-decimal currency", () => {
    setFormat(base);
    expect(money(123450)).toBe("AED 1,234.50");
    expect(money(2500)).toBe("AED 25");
    expect(num(2550)).toBe("25.5");
    expect(toInput(2550)).toBe("25.5");
    expect(fromInput("25.5")).toBe(2550);
  });
  it("3-decimal currency (KWD)", () => {
    setFormat({ ...base, currency: "KWD", currency_minor: 1000, locale: "en-GB" });
    expect(minorDigits()).toBe(3);
    expect(money(1234500)).toBe("KWD 1,234.500");
    expect(fromInput("1.5")).toBe(1500);
    expect(toInput(1500)).toBe("1.5");
  });
  it("0-decimal currency (JPY)", () => {
    setFormat({ ...base, currency: "JPY", currency_minor: 1, locale: "en-GB" });
    expect(money(1500)).toBe("JPY 1,500");
    expect(fromInput("1500")).toBe(1500);
  });
});

describe("business day per salon", () => {
  it("Kolkata with day start 6", () => {
    setFormat({ ...base, timezone: "Asia/Kolkata", day_start_hour: 6 });
    expect(businessDay(Date.parse("2026-11-02T05:30:00+05:30"))).toBe("2026-11-01");
    expect(businessDay(Date.parse("2026-11-02T06:00:00+05:30"))).toBe("2026-11-02");
  });
  it("Dubai with day start 4 (FM rule)", () => {
    setFormat(base);
    expect(businessDay(Date.parse("2026-10-27T03:59:00+04:00"))).toBe("2026-10-26");
    expect(businessDay(Date.parse("2026-10-27T04:00:00+04:00"))).toBe("2026-10-27");
  });
  it("New York across spring-forward keeps the wall-time boundary", () => {
    setFormat({ ...base, timezone: "America/New_York", day_start_hour: 4 });
    // 2026-03-08: clocks jump 02:00 -> 03:00 EST->EDT.
    expect(businessDay(Date.parse("2026-03-08T03:30:00-04:00"))).toBe("2026-03-07");
    expect(businessDay(Date.parse("2026-03-08T04:00:00-04:00"))).toBe("2026-03-08");
  });
});

describe("phones per salon", () => {
  it("splits international numbers by calling code", () => {
    setFormat({ ...base, phone_country: "91" });
    expect(splitPhone("+919812345678")).toEqual({ cc: "91", local: "9812345678" });
    expect(splitPhone(null)).toEqual({ cc: "91", local: "" });
  });
  it("local 0-numbers belong to the salon's own country", () => {
    setFormat(base);
    expect(splitPhone("0501234567")).toEqual({ cc: base.phone_country, local: "501234567" });
    expect(whatsappDigits("0501234567")).toBe(`${base.phone_country}501234567`);
    expect(whatsappDigits("+447700900123")).toBe("447700900123");
  });
});
