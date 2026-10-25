import { describe, expect, it, vi } from "vitest";
import { parseRecapRequest, requestRecap, type RecapResponse } from "./recap";

const TERM = { key: "quantity", status: "stated", value: "200", quote: ["200 notebooks"], msg: [1], confirmed: true };
const OK: RecapResponse = {
  language: "en", title: "t", text: "Hi", lines: [], open_points: [], suggestions: [], reply_line: "CONFIRM {code}", disclaimer: "d",
};

function fetchReturning(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

describe("parseRecapRequest", () => {
  it("accepts a well-formed request and keeps only known fields", () => {
    const r = parseRecapRequest({ playbook_id: "supply-order", language: "hi", other_name: "Kavi", terms: [{ ...TERM, reason: "MODEL TEXT" }], extra: 1 });
    expect(r).toEqual({ ok: true, value: { playbook_id: "supply-order", language: "hi", other_name: "Kavi", terms: [TERM] } });
  });

  it("other_name is optional", () => {
    const r = parseRecapRequest({ playbook_id: "p", language: "en", terms: [] });
    expect(r).toEqual({ ok: true, value: { playbook_id: "p", language: "en", terms: [] } });
  });

  it.each([
    [null], ["x"], [[]], [{}],
    [{ playbook_id: "", language: "en", terms: [] }],
    [{ playbook_id: "p", language: "fr", terms: [] }],
    [{ playbook_id: "p", language: "en" }],
    [{ playbook_id: "p", language: "en", terms: "x" }],
    [{ playbook_id: "p", language: "en", terms: [null] }],
    [{ playbook_id: "p", language: "en", terms: [{ ...TERM, key: 5 }] }],
    [{ playbook_id: "p", language: "en", terms: [{ ...TERM, status: 5 }] }],
    [{ playbook_id: "p", language: "en", terms: [{ ...TERM, value: 5 }] }],
    [{ playbook_id: "p", language: "en", terms: [{ ...TERM, quote: "x" }] }],
    [{ playbook_id: "p", language: "en", terms: [{ ...TERM, msg: ["1"] }] }],
    [{ playbook_id: "p", language: "en", terms: [{ ...TERM, confirmed: "yes" }] }],
    [{ playbook_id: "p", language: "en", other_name: 5, terms: [] }],
  ])("rejects %j", (input) => {
    expect(parseRecapRequest(input).ok).toBe(false);
  });

  it("allows a null value", () => {
    const r = parseRecapRequest({ playbook_id: "p", language: "en", terms: [{ ...TERM, status: "missing", value: null, confirmed: false }] });
    expect(r.ok).toBe(true);
  });
});

describe("requestRecap", () => {
  const req = { playbook_id: "supply-order", language: "en" as const, terms: [TERM] };

  it("passes the recap through", async () => {
    const fetchImpl = fetchReturning(200, OK);
    expect(await requestRecap(req, { baseUrl: "http://ai", fetchImpl })).toEqual({ status: 200, body: OK });
    expect(fetchImpl).toHaveBeenCalledWith("http://ai/v1/recap", expect.objectContaining({ method: "POST" }));
  });

  it("passes the service's refusal about the input through with its message", async () => {
    const detail = { code: "bad_recap_request", message: "term 'x' cannot be confirmed" };
    const r = await requestRecap(req, { baseUrl: "http://ai", fetchImpl: fetchReturning(422, { detail }) });
    expect(r).toEqual({ status: 422, body: { error: "bad_recap_request", message: "term 'x' cannot be confirmed" } });
  });

  it("is 503 without AI_SERVICE_URL, 502 on a failure or a wrong shape", async () => {
    expect((await requestRecap(req, { baseUrl: undefined, fetchImpl: fetchReturning(200, OK) })).status).toBe(503);
    expect((await requestRecap(req, { baseUrl: "http://ai", fetchImpl: fetchReturning(500, { detail: "secret trace" }) })).status).toBe(502);
    expect((await requestRecap(req, { baseUrl: "http://ai", fetchImpl: fetchReturning(200, { nope: 1 }) })).status).toBe(502);
    const boom = vi.fn(async () => { throw new Error("down"); }) as unknown as typeof fetch;
    expect((await requestRecap(req, { baseUrl: "http://ai", fetchImpl: boom })).status).toBe(502);
  });
});
