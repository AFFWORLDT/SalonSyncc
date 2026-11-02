import { describe, expect, it } from "vitest";
import {
  allowedRecipient,
  bodyParams,
  firstName,
  previewText,
  templateComponents,
  templateSlots,
  templateVars,
  validSignature,
  visitTime,
  waRecipient,
  webhookEvents,
} from "../../src/lib/whatsapp";

// Ported from FM api/src/whatsapp.test.ts (971 cases unchanged) plus Indian (91) cases. rateLinkSuffix is not ported.
const DXB = { timezone: "Asia/Dubai", dayStartHour: 4 };
const IN = { timezone: "Asia/Kolkata", dayStartHour: 4 };

describe("templateVars", () => {
  it("is the highest {{n}} in the body", () => {
    expect(templateVars("Hi {{1}}, bill {{2}} for AED {{3}}: {{4}} bye")).toBe(4);
    expect(templateVars("No blanks")).toBe(0);
    expect(templateVars("{{2}} then {{1}}")).toBe(2);
  });
});

describe("waRecipient", () => {
  it("971: canonical phone -> digits Meta wants", () => {
    expect(waRecipient("0501234567", "971")).toBe("971501234567");
    expect(waRecipient("+919511506049", "971")).toBe("919511506049");
  });
  it("91: national 0-prefixed and +91 numbers", () => {
    expect(waRecipient("+919511506049", "91")).toBe("919511506049");
    expect(waRecipient("09511506049", "91")).toBe("919511506049");
    expect(waRecipient("+91 95115 06049", "91")).toBe("919511506049");
  });
});

describe("allowedRecipient", () => {
  it("no list = everyone; a list = only those (any format)", () => {
    expect(allowedRecipient(undefined, "0501234567", "971")).toBe(true);
    expect(allowedRecipient(null, "0501234567", "971")).toBe(true);
    expect(allowedRecipient("", "0501234567", "971")).toBe(true);
    expect(allowedRecipient("+919511506049", "+919511506049", "971")).toBe(true);
    expect(allowedRecipient("+91 95115 06049, +971501112222", "0501112222", "971")).toBe(true);
    expect(allowedRecipient("+919511506049", "0501234567", "971")).toBe(false);
  });
  it("91: a national test number matches the +91 customer", () => {
    expect(allowedRecipient("09511506049", "+919511506049", "91")).toBe(true);
    expect(allowedRecipient("+919511506049", "+919800000000", "91")).toBe(false);
  });
});

describe("firstName", () => {
  it("friendly greeting, 'there' for the auto labels", () => {
    expect(firstName("Naveed Khan")).toBe("Naveed");
    expect(firstName("Customer 12")).toBe("there");
    expect(firstName(null)).toBe("there");
    expect(firstName("  ")).toBe("there");
  });
});

describe("bodyParams", () => {
  it("fixed text or the customer's name per blank; empty -> '-'", () => {
    expect(bodyParams([{ text: "20% off" }, { customer_name: true }], "Ali Raza")).toEqual(["20% off", "Ali"]);
    expect(bodyParams([{ text: "" }], null)).toEqual(["-"]);
    expect(bodyParams([{ customer_name: true }], null)).toEqual(["there"]);
  });
  it("keeps each blank's place when the spec carries it", () => {
    expect(bodyParams([{ customer_name: true, part: "header", key: "contact_name", named: true }, { text: "20%", part: "body", key: "1" }], "Ali Raza")).toEqual([
      { part: "header", key: "contact_name", named: true, text: "Ali" },
      { part: "body", key: "1", text: "20%" },
    ]);
  });
});

describe("previewText", () => {
  it("fills numbered and named blanks", () => {
    expect(previewText("Hi {{1}}, {{2}}!", ["Ali", "welcome"])).toBe("Hi Ali, welcome!");
    expect(previewText("Hi {{1}}", [])).toBe("Hi {{1}}");
    expect(previewText("Hi {{contact_name}}!", { contact_name: "Ali" })).toBe("Hi Ali!");
  });
});

describe("templateSlots", () => {
  it("header blanks first, then body; numbered or named", () => {
    expect(templateSlots(null, "Hi {{1}}, bill {{2}}")).toEqual([
      { part: "body", key: "1" },
      { part: "body", key: "2" },
    ]);
    expect(templateSlots("Hi {{contact_name}}", "Thanks for visiting 💈")).toEqual([{ part: "header", key: "contact_name", named: true }]);
    expect(templateSlots("Hi {{1}}", "{{name}} and {{offer}}, again {{name}}")).toEqual([
      { part: "header", key: "1" },
      { part: "body", key: "name", named: true },
      { part: "body", key: "offer", named: true },
    ]);
    expect(templateSlots(null, "No blanks")).toEqual([]);
  });
  it("a media header is one slot", () => {
    expect(templateSlots(null, "Hi {{1}}", "video")).toEqual([
      { part: "header", key: "media", media: "video" },
      { part: "body", key: "1" },
    ]);
  });
});

describe("templateComponents", () => {
  it("plain strings are numbered body values", () => {
    expect(templateComponents(["Ali", "B-12"])).toEqual([{ type: "body", parameters: [{ type: "text", text: "Ali" }, { type: "text", text: "B-12" }] }]);
    expect(templateComponents([])).toEqual([]);
  });
  it("named and header values", () => {
    expect(templateComponents([{ part: "header", key: "contact_name", named: true, text: "Ali" }])).toEqual([
      { type: "header", parameters: [{ type: "text", parameter_name: "contact_name", text: "Ali" }] },
    ]);
    expect(
      templateComponents([
        { part: "header", key: "1", text: "Ali" },
        { part: "body", key: "1", text: "20%" },
      ]),
    ).toEqual([
      { type: "header", parameters: [{ type: "text", text: "Ali" }] },
      { type: "body", parameters: [{ type: "text", text: "20%" }] },
    ]);
  });
  it("media headers: id, link, document link + filename", () => {
    expect(templateComponents([{ part: "header", key: "media", media: "video", text: "1234567890" }, "Ali"])).toEqual([
      { type: "header", parameters: [{ type: "video", video: { id: "1234567890" } }] },
      { type: "body", parameters: [{ type: "text", text: "Ali" }] },
    ]);
    expect(templateComponents([{ part: "header", key: "media", media: "document", text: "https://x.dev/api/public/bill/abc", filename: "Bill_FM-1.pdf" }])).toEqual([
      { type: "header", parameters: [{ type: "document", document: { link: "https://x.dev/api/public/bill/abc", filename: "Bill_FM-1.pdf" } }] },
    ]);
    expect(templateComponents([{ part: "header", key: "media", media: "image", text: "https://x.dev/a.jpg" }])).toEqual([
      { type: "header", parameters: [{ type: "image", image: { link: "https://x.dev/a.jpg" } }] },
    ]);
  });
  it("a button link's blank: its index and the suffix text", () => {
    expect(templateComponents([{ part: "header", key: "media", media: "image", text: "https://x/wa/r.jpg" }, "Ali", { part: "button", index: 0, text: "Ab12" }])).toEqual([
      { type: "header", parameters: [{ type: "image", image: { link: "https://x/wa/r.jpg" } }] },
      { type: "body", parameters: [{ type: "text", text: "Ali" }] },
      { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "Ab12" }] },
    ]);
  });
});

describe("webhookEvents", () => {
  it("Meta's payload -> status updates and STOP replies", () => {
    const ev = webhookEvents({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                statuses: [
                  { id: "wamid.A", status: "delivered", timestamp: "1793122600" },
                  { id: "wamid.B", status: "read", timestamp: "1793122700" },
                  { id: "wamid.C", status: "failed", timestamp: "1793122800", errors: [{ code: 131026, title: "Message undeliverable" }] },
                  { id: "wamid.D", status: "sent", timestamp: "1793122500" },
                ],
                messages: [
                  { from: "919511506049", type: "text", text: { body: "  stop " } },
                  { from: "971501112233", type: "text", text: { body: "Thanks!" } },
                  { from: "971509998877", type: "button", button: { text: "Stop promotions" } },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(ev.statuses).toEqual([
      { wa_id: "wamid.A", status: "delivered", at: 1793122600000, error: null },
      { wa_id: "wamid.B", status: "read", at: 1793122700000, error: null },
      { wa_id: "wamid.C", status: "failed", at: 1793122800000, error: "Message undeliverable (131026)" },
    ]);
    expect(ev.optOuts).toEqual(["+919511506049", "+971509998877"]);
    expect(webhookEvents(null)).toEqual({ statuses: [], optOuts: [] });
    expect(webhookEvents({ entry: "junk" })).toEqual({ statuses: [], optOuts: [] });
  });
});

describe("validSignature", () => {
  it("checks sha256=<hex HMAC(app secret, raw body)>", async () => {
    const body = '{"entry":[]}';
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode("s3cret"), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
    const sig = "sha256=" + Array.from(mac, (b) => b.toString(16).padStart(2, "0")).join("");
    expect(await validSignature("s3cret", body, sig)).toBe(true);
    expect(await validSignature("other", body, sig)).toBe(false);
    expect(await validSignature("s3cret", body + " ", sig)).toBe(false);
    expect(await validSignature("s3cret", body, undefined)).toBe(false);
    expect(await validSignature("s3cret", body, "sha256=abc")).toBe(false);
  });
});

describe("visitTime", () => {
  it("971: 'Thursday, 29-10-26, 12:01 PM' in the org's timezone", () => {
    expect(visitTime(Date.UTC(2026, 9, 29, 8, 1), DXB, "en-GB")).toBe("Thursday, 29-10-26, 12:01 PM");
  });
  it("91: Asia/Kolkata", () => {
    expect(visitTime(Date.UTC(2026, 9, 29, 8, 1), IN, "en-IN")).toBe("Thursday, 29-10-26, 1:31 PM");
  });
  it("an unknown locale falls back instead of throwing", () => {
    expect(visitTime(Date.UTC(2026, 9, 29, 8, 1), DXB, "not a locale!!")).toBe("Thursday, 29-10-26, 12:01 PM");
  });
});
