/**
 * Client for apps/ai-service POST /v1/terms: a chat (text or text PDF) in,
 * proposed terms with source links out. CLAUDE.md rule 2: this is read-only
 * and suggestion-only. Nothing here writes to the vault, the audit log or the
 * hash path; a term reaches the vault only when a person confirms it.
 */

export interface TermsRequest {
  playbook_id: string;
  chat_text?: string;
  pdf_base64?: string;
}

export type TermStatus = "stated" | "unclear" | "contradicted" | "missing" | "needs_review";

export interface TermSource {
  msg: number;
  sender: string | null;
  text: string;
  quote: string;
}

export interface TermView {
  key: string;
  label: string;
  type: string;
  required: boolean;
  status: TermStatus;
  model_status: string | null;
  value: string | null;
  quote: string[];
  msg: number[];
  reason: string;
  problems: string[];
  sources: TermSource[];
}

export interface FlagView {
  id: string;
  term: string;
  msg: number[];
  reason: string;
}

export interface TermsResponse {
  playbook_id: string;
  model_mode: string;
  demo_mode: boolean;
  demo_badge: string | null;
  messages: { n: number; kind: string; sender: string | null; text: string; timestamp: string | null }[];
  import_problems: { line: number; text: string }[];
  report: { terms: TermView[]; flags: FlagView[]; ignored_keys: string[]; output_problems: string[]; model_error: string | null };
}

export type TermsResult = { status: number; body: TermsResponse | { error: string; message: string } };

export function parseTermsRequest(input: unknown): { ok: true; value: TermsRequest } | { ok: false; message: string } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { ok: false, message: "Expected a JSON object." };
  const o = input as Record<string, unknown>;
  if (typeof o.playbook_id !== "string" || o.playbook_id === "") return { ok: false, message: "playbook_id is required." };
  const hasText = o.chat_text !== undefined;
  const hasPdf = o.pdf_base64 !== undefined;
  if (hasText === hasPdf) return { ok: false, message: "Send exactly one of chat_text or pdf_base64." };
  if (hasText) {
    if (typeof o.chat_text !== "string") return { ok: false, message: "chat_text must be text." };
    return { ok: true, value: { playbook_id: o.playbook_id, chat_text: o.chat_text } };
  }
  if (typeof o.pdf_base64 !== "string") return { ok: false, message: "pdf_base64 must be text." };
  return { ok: true, value: { playbook_id: o.playbook_id, pdf_base64: o.pdf_base64 } };
}

function looksLikeTermsResponse(b: unknown): b is TermsResponse {
  if (typeof b !== "object" || b === null) return false;
  const r = b as Record<string, unknown>;
  const report = r.report as Record<string, unknown> | undefined;
  return typeof r.playbook_id === "string" && Array.isArray(r.messages) && typeof report === "object" && report !== null && Array.isArray(report.terms);
}

/** Maps a non-OK AI service answer. Its own refusals about the input ({detail: {code, message}}) are shown; anything else is not for the user. */
export function aiFailure(status: number, body: unknown): { status: number; body: { error: string; message: string } } {
  const detail = typeof body === "object" && body !== null ? (body as { detail?: unknown }).detail : undefined;
  if ((status === 422 || status === 413) && typeof detail === "object" && detail !== null) {
    const d = detail as { code?: unknown; message?: unknown };
    if (typeof d.code === "string" && typeof d.message === "string") return { status, body: { error: d.code, message: d.message } };
  }
  return { status: 502, body: { error: "AI_SERVICE_ERROR", message: "The analysis service could not process this request." } };
}

export async function requestTerms(
  req: TermsRequest,
  opts: { baseUrl?: string | undefined; fetchImpl?: typeof fetch } = { baseUrl: process.env.AI_SERVICE_URL }
): Promise<TermsResult> {
  const baseUrl = "baseUrl" in opts ? opts.baseUrl : process.env.AI_SERVICE_URL;
  const fetchImpl = opts.fetchImpl ?? fetch;
  if (!baseUrl) return { status: 503, body: { error: "SERVER_MISCONFIGURED", message: "AI_SERVICE_URL is not set." } };

  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}/v1/terms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(60_000),
    });
  } catch {
    return { status: 502, body: { error: "AI_SERVICE_UNAVAILABLE", message: "The analysis service could not be reached." } };
  }

  const body: unknown = await res.json().catch(() => null);
  if (res.ok) {
    if (!looksLikeTermsResponse(body)) {
      return { status: 502, body: { error: "AI_SERVICE_BAD_RESPONSE", message: "The analysis service sent an answer in an unexpected format." } };
    }
    return { status: 200, body };
  }
  return aiFailure(res.status, body);
}
