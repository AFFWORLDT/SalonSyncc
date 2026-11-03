import { it, expect } from "vitest";
import { handle, TARGET } from "../../../deploy/fm-redirect/src/index";

const OLD = "https://fm-salon.affworld0.workers.dev";

it("sends every old FM link to the same path on fm.salonkit.online", async () => {
  for (const path of ["/", "/r/?t=abc123", "/rate/?t=tok", "/sales/", "/api/public/bill/tok"]) {
    const res = await handle(new Request(`${OLD}${path}`), () => Promise.reject(new Error("no upstream")));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${TARGET}${path}`);
    expect(res.headers.get("cache-control")).toBe("no-store");
  }
});

it("proxies Meta's webhook with its body and signature, since Meta does not follow redirects", async () => {
  let seen: Request | null = null;
  const res = await handle(
    new Request(`${OLD}/api/wa/webhook`, { method: "POST", headers: { "x-hub-signature-256": "sha256=ab", "content-type": "application/json" }, body: '{"entry":[]}' }),
    async (r) => {
      seen = r as Request;
      return new Response("ok", { status: 200 });
    },
  );
  expect(res.status).toBe(200);
  expect(seen!.url).toBe(`${TARGET}/api/wa/webhook`);
  expect(seen!.method).toBe("POST");
  expect(seen!.headers.get("x-hub-signature-256")).toBe("sha256=ab");
  expect(await seen!.text()).toBe('{"entry":[]}');
  const verify = await handle(new Request(`${OLD}/api/wa/webhook?hub.mode=subscribe&hub.challenge=7`), async (r) => new Response((r as Request).url));
  expect(await verify.text()).toBe(`${TARGET}/api/wa/webhook?hub.mode=subscribe&hub.challenge=7`);
});
