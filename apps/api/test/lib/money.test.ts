import { describe, expect, it } from "vitest";
import { barberNet, commissionOf, shopProfit, signedMinor, toMinor, vatOf, DAY_RE, MONTH_RE } from "../../src/lib/money";
import { addDays, businessDay, businessDayStart, dayStamp, daysOfMonth, localHour, prevMonth } from "../../src/lib/clock";
import { canonicalPhone, whatsappDigits } from "../../src/lib/phone";

const DXB = { timezone: "Asia/Dubai", dayStartHour: 4 };
const IN = { timezone: "Asia/Kolkata", dayStartHour: 4 };
const UK = { timezone: "Europe/London", dayStartHour: 4 };
const dubai = (iso: string) => Date.parse(iso + "+04:00");

describe("signedMinor", () => {
  it("allows zero and negatives (FM signedFils)", () => {
    expect(signedMinor(0)).toBe(0);
    expect(signedMinor("0")).toBe(0);
    expect(signedMinor("-12.5")).toBe(-1250);
    expect(signedMinor("25")).toBe(2500);
    expect(signedMinor("")).toBeNull();
    expect(signedMinor("abc")).toBeNull();
    expect(signedMinor("1.005")).toBeNull();
  });
});

describe("businessDay (Dubai, FM values)", () => {
  it("runs 4:00 to 3:59", () => {
    expect(businessDay(dubai("2026-10-26T08:00:00"), DXB)).toBe("2026-10-26");
    expect(businessDay(dubai("2026-10-26T23:30:00"), DXB)).toBe("2026-10-26");
    expect(businessDay(dubai("2026-10-27T02:00:00"), DXB)).toBe("2026-10-26");
    expect(businessDay(dubai("2026-10-27T03:59:59"), DXB)).toBe("2026-10-26");
    expect(businessDay(dubai("2026-10-27T04:00:00"), DXB)).toBe("2026-10-27");
    expect(businessDay(dubai("2027-01-01T02:00:00"), DXB)).toBe("2026-12-31");
    expect(businessDay(dubai("2026-03-01T01:00:00"), DXB)).toBe("2026-02-28");
  });
  it("businessDayStart", () => {
    expect(businessDayStart("2026-10-26", DXB)).toBe(dubai("2026-10-26T04:00:00"));
    expect(businessDay(businessDayStart("2026-10-26", DXB), DXB)).toBe("2026-10-26");
    expect(businessDay(businessDayStart("2026-10-26", DXB) - 1, DXB)).toBe("2026-10-25");
  });
  it("maps an instant across the UTC midnight seam (FM dubaiDay, now dayStartHour 0)", () => {
    const c = { timezone: "Asia/Dubai", dayStartHour: 0 };
    expect(businessDay(Date.UTC(2026, 9, 21, 19, 59), c)).toBe("2026-10-21");
    expect(businessDay(Date.UTC(2026, 9, 21, 20, 0), c)).toBe("2026-10-22");
  });
});

describe("clock across zones and DST (RF2)", () => {
  it("India", () => {
    expect(businessDay(Date.parse("2026-11-02T03:30:00+05:30"), IN)).toBe("2026-11-01");
    expect(businessDay(Date.parse("2026-11-02T04:00:00+05:30"), IN)).toBe("2026-11-02");
  });
  it("London DST edges", () => {
    expect(businessDayStart("2026-03-29", UK)).toBe(Date.parse("2026-03-29T04:00:00+01:00"));
    expect(businessDayStart("2026-10-25", UK)).toBe(Date.parse("2026-10-25T04:00:00+00:00"));
    expect(businessDayStart("2026-07-01", UK)).toBe(Date.parse("2026-07-01T04:00:00+01:00"));
  });
  it("hours >= 10 (FM T0 bug)", () => {
    expect(businessDayStart("2026-11-02", DXB)).toBe(Date.parse("2026-11-02T04:00:00+04:00"));
    expect(businessDayStart("2026-11-02", { timezone: "Asia/Dubai", dayStartHour: 11 })).toBe(Date.parse("2026-11-02T11:00:00+04:00"));
  });
  it("DST gap uses the first valid instant after it", () => {
    // New York 2026-03-08: 02:00 -> 03:00 local; 02:30 does not exist
    const NY = { timezone: "America/New_York", dayStartHour: 2 };
    expect(businessDayStart("2026-03-08", NY)).toBe(Date.parse("2026-03-08T03:00:00-04:00"));
  });
  it("business day is wall-clock based around DST", () => {
    expect(businessDay(Date.parse("2026-03-29T03:30:00+01:00"), UK)).toBe("2026-03-28");
    expect(businessDay(Date.parse("2026-03-29T04:00:00+01:00"), UK)).toBe("2026-03-29");
    expect(businessDay(businessDayStart("2026-10-25", UK) - 1, UK)).toBe("2026-10-24");
  });
  it("localHour and dayStamp", () => {
    expect(localHour(Date.parse("2026-11-02T23:30:00+05:30"), IN)).toBe(23);
    expect(localHour(Date.parse("2026-11-02T00:10:00+05:30"), IN)).toBe(0);
    expect(dayStamp("2026-10-26")).toBe("20261026");
  });
  it("rejects a dayStartHour outside 0..12", () => {
    expect(() => businessDay(0, { timezone: "Asia/Dubai", dayStartHour: 13 })).toThrow();
    expect(() => businessDayStart("2026-11-02", { timezone: "Asia/Dubai", dayStartHour: -1 })).toThrow();
  });
});

describe("toMinor", () => {
  it("parses amounts", () => {
    expect(toMinor(25)).toBe(2500);
    expect(toMinor("25.5")).toBe(2550);
    expect(toMinor("0.01")).toBe(1);
    expect(toMinor(" 30 ")).toBe(3000);
    expect(toMinor(19.99)).toBe(1999);
  });
  it("rejects bad input", () => {
    expect(toMinor(0)).toBeNull();
    expect(toMinor(-5)).toBeNull();
    expect(toMinor("abc")).toBeNull();
    expect(toMinor("")).toBeNull();
    expect(toMinor("1.234")).toBeNull();
    expect(toMinor(1_000_001)).toBeNull();
  });
  it("honours a different minor unit", () => {
    expect(toMinor("5", 1)).toBe(5);
    expect(toMinor("5.5", 1)).toBeNull();
    expect(toMinor("1.234", 1000)).toBe(1234);
  });
});

describe("money maths", () => {
  it("commission", () => {
    expect(commissionOf(33500, 7.5)).toBe(2513);
    expect(commissionOf(2000, 0)).toBe(0);
    expect(commissionOf(2000, 10)).toBe(200);
  });
  it("VAT inclusive, percent rate", () => {
    expect(vatOf(10500, 5)).toBe(500);
    expect(vatOf(2000, 5)).toBe(95);
    expect(vatOf(2000, 0)).toBe(0);
  });
  it("profit and net", () => {
    expect(shopProfit({ sales: 183000, expense: 17900, commission: 10100 })).toBe(155000);
    expect(barberNet({ sales: 33500, expense: 5000, commission: 2500 })).toBe(28500);
    expect(barberNet({ sales: 10000, expense: 0, commission: 9999 })).toBe(10000);
  });
});

describe("calendar helpers", () => {
  it("days and months", () => {
    expect(daysOfMonth("2026-02").length).toBe(28);
    expect(daysOfMonth("2028-02").length).toBe(29);
    expect(daysOfMonth("2026-10")[30]).toBe("2026-10-31");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(prevMonth("2026-01")).toBe("2025-12");
    expect(prevMonth("2026-10")).toBe("2026-09");
  });
  it("regexes", () => {
    expect(DAY_RE.test("2026-10-26")).toBe(true);
    expect(DAY_RE.test("2026-13-01")).toBe(false);
    expect(MONTH_RE.test("2026-10")).toBe(true);
  });
});

describe("phones", () => {
  it("UAE mobile many ways", () => {
    for (const p of ["050 123 4567", "+971 50 123 4567", "00971501234567", "971501234567", "501234567"]) expect(canonicalPhone(p, "971")).toBe("0501234567");
  });
  it("UAE landline, foreign, junk", () => {
    expect(canonicalPhone("04 123 4567", "971")).toBe("041234567");
    expect(canonicalPhone("+91 98765 43210", "971")).toBe("+919876543210");
    expect(canonicalPhone("12345", "971")).toBeNull();
    expect(canonicalPhone("0801234567", "971")).toBeNull();
    expect(canonicalPhone("", "971")).toBeNull();
  });
  it("other calling codes", () => {
    expect(canonicalPhone("9876543210", "91")).toBe("+919876543210");
    expect(canonicalPhone("09876543210", "91")).toBe("+919876543210");
    expect(canonicalPhone("+44 7700 900123", "91")).toBe("+447700900123");
    expect(canonicalPhone("0044 7700 900123", "91")).toBe("+447700900123");
    expect(canonicalPhone("123", "91")).toBeNull();
    expect(canonicalPhone("+1234567890123456", "91")).toBeNull();
    expect(canonicalPhone("abc", "91")).toBeNull();
  });
  it("whatsapp digits", () => {
    expect(whatsappDigits("0501234567", "971")).toBe("971501234567");
    expect(whatsappDigits("+919876543210", "971")).toBe("919876543210");
    expect(whatsappDigits("+919876543210", "91")).toBe("919876543210");
  });
});
