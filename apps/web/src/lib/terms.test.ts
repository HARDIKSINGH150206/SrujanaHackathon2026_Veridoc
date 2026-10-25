import { describe, expect, it, vi } from "vitest";
import { parseTermsRequest, requestTerms } from "./terms";

const OK_BODY = { playbook_id: "supply-order", demo_mode: true, report: { terms: [] }, messages: [] };

function fetchReturning(status: number, body: unknown): typeof fetch {
  return vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch;
}

describe("parseTermsRequest", () => {
  it("accepts a playbook with chat text", () => {
    expect(parseTermsRequest({ playbook_id: "supply-order", chat_text: "x" })).toEqual({ ok: true, value: { playbook_id: "supply-order", chat_text: "x" } });
  });

  it("accepts a playbook with a PDF", () => {
    expect(parseTermsRequest({ playbook_id: "supply-order", pdf_base64: "JVBERi0=" })).toEqual({ ok: true, value: { playbook_id: "supply-order", pdf_base64: "JVBERi0=" } });
  });

  it.each([
    [null],
    ["text"],
    [[]],
    [{}],
    [{ playbook_id: "", chat_text: "x" }],
    [{ playbook_id: 5, chat_text: "x" }],
    [{ playbook_id: "supply-order" }],
    [{ playbook_id: "supply-order", chat_text: "x", pdf_base64: "y" }],
    [{ playbook_id: "supply-order", chat_text: 5 }],
    [{ playbook_id: "supply-order", pdf_base64: ["y"] }],
  ])("rejects %j", (input) => {
    const r = parseTermsRequest(input);
    expect(r.ok).toBe(false);
  });

  it("drops fields it does not know about", () => {
    const r = parseTermsRequest({ playbook_id: "p", chat_text: "x", extra: 1 });
    expect(r).toEqual({ ok: true, value: { playbook_id: "p", chat_text: "x" } });
  });
});

describe("requestTerms", () => {
  const req = { playbook_id: "supply-order", chat_text: "x" };

  it("passes the AI service's answer through", async () => {
    const fetchImpl = fetchReturning(200, OK_BODY);
    const r = await requestTerms(req, { baseUrl: "http://ai", fetchImpl });
    expect(r).toEqual({ status: 200, body: OK_BODY });
    expect(fetchImpl).toHaveBeenCalledWith("http://ai/v1/terms", expect.objectContaining({ method: "POST" }));
  });

  it("sends the request as JSON and nothing else", async () => {
    const fetchImpl = fetchReturning(200, OK_BODY);
    await requestTerms(req, { baseUrl: "http://ai", fetchImpl });
    const init = (fetchImpl as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0][1];
    expect(JSON.parse(init.body as string)).toEqual(req);
  });

  it("passes a scanned-PDF refusal through with its code", async () => {
    const detail = { code: "scanned_pdf_not_supported", message: "not supported yet" };
    const r = await requestTerms({ playbook_id: "p", pdf_base64: "x" }, { baseUrl: "http://ai", fetchImpl: fetchReturning(422, { detail }) });
    expect(r).toEqual({ status: 422, body: { error: "scanned_pdf_not_supported", message: "not supported yet" } });
  });

  it("maps other AI service errors to 502 without leaking their text", async () => {
    const r = await requestTerms(req, { baseUrl: "http://ai", fetchImpl: fetchReturning(500, { detail: "Traceback secret" }) });
    expect(r.status).toBe(502);
    expect(JSON.stringify(r.body)).not.toContain("secret");
  });

  it("maps a network failure to 502", async () => {
    const fetchImpl = vi.fn(async () => { throw new Error("ECONNREFUSED"); }) as unknown as typeof fetch;
    const r = await requestTerms(req, { baseUrl: "http://ai", fetchImpl });
    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({ error: "AI_SERVICE_UNAVAILABLE" });
  });

  it("is 503 when AI_SERVICE_URL is not set", async () => {
    const r = await requestTerms(req, { baseUrl: undefined, fetchImpl: fetchReturning(200, OK_BODY) });
    expect(r.status).toBe(503);
  });

  it("refuses an AI service answer that is not the expected shape", async () => {
    const r = await requestTerms(req, { baseUrl: "http://ai", fetchImpl: fetchReturning(200, { nope: true }) });
    expect(r.status).toBe(502);
  });
});
