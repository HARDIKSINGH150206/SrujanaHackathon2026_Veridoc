import { describe, expect, it, vi } from "vitest";
import { parseTermsRequest, requestPlaybooks, requestTerms } from "./terms";

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

  it("accepts voice notes and corrections with the chat text", () => {
    const input = {
      playbook_id: "p",
      chat_text: "x",
      voice_notes: [{ name: "PTT-1.opus", audio_base64: "AAAA" }],
      voice_corrections: { "PTT-1.opus": "fixed" },
    };
    expect(parseTermsRequest(input)).toEqual({ ok: true, value: input });
  });

  it.each([
    [{ playbook_id: "p", chat_text: "x", voice_notes: "no" }],
    [{ playbook_id: "p", chat_text: "x", voice_notes: [{ name: 5, audio_base64: "A" }] }],
    [{ playbook_id: "p", chat_text: "x", voice_notes: [{ name: "a.wav" }] }],
    [{ playbook_id: "p", chat_text: "x", voice_corrections: [] }],
    [{ playbook_id: "p", chat_text: "x", voice_corrections: { "a.wav": 5 } }],
    [{ playbook_id: "p", pdf_base64: "x", voice_notes: [{ name: "a.wav", audio_base64: "A" }] }],
  ])("rejects bad voice input %j", (input) => {
    expect(parseTermsRequest(input).ok).toBe(false);
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

describe("requestPlaybooks", () => {
  const LIST = { playbooks: [{ id: "supply-order", title: "Supply or order", terms: [] }] };

  it("passes the list through", async () => {
    const fetchImpl = fetchReturning(200, LIST);
    expect(await requestPlaybooks({ baseUrl: "http://ai", fetchImpl })).toEqual({ status: 200, body: LIST });
    expect(fetchImpl).toHaveBeenCalledWith("http://ai/v1/playbooks", expect.anything());
  });

  it("is 503 without AI_SERVICE_URL, 502 on failure or a wrong shape", async () => {
    expect((await requestPlaybooks({ baseUrl: undefined, fetchImpl: fetchReturning(200, LIST) })).status).toBe(503);
    expect((await requestPlaybooks({ baseUrl: "http://ai", fetchImpl: fetchReturning(500, {}) })).status).toBe(502);
    expect((await requestPlaybooks({ baseUrl: "http://ai", fetchImpl: fetchReturning(200, { nope: 1 }) })).status).toBe(502);
    const boom = vi.fn(async () => { throw new Error("down"); }) as unknown as typeof fetch;
    expect((await requestPlaybooks({ baseUrl: "http://ai", fetchImpl: boom })).status).toBe(502);
  });
});
