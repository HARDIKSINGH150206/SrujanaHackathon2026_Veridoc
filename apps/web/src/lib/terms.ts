/**
 * Client for apps/ai-service POST /v1/terms: a chat (text or text PDF) in,
 * proposed terms with source links out. CLAUDE.md rule 2: this is read-only
 * and suggestion-only. Nothing here writes to the vault, the audit log or the
 * hash path; a term reaches the vault only when a person confirms it.
 */

export interface VoiceNoteInput {
  name: string;
  audio_base64: string;
}

export interface TermsRequest {
  playbook_id: string;
  chat_text?: string;
  pdf_base64?: string;
  voice_notes?: VoiceNoteInput[];
  voice_corrections?: Record<string, string>;
}

export interface VoiceInfo {
  name: string;
  sha256: string;
  size: number;
  corrected: boolean;
  segments: { start_ms: number; end_ms: number; text: string }[];
}

export type TermStatus = "stated" | "unclear" | "contradicted" | "missing" | "needs_review";

export interface TermSource {
  msg: number;
  sender: string | null;
  text: string;
  quote: string;
  /** Set when the quote comes from a voice note: its audio and the transcript span. */
  voice?: { name: string; sha256: string; start_ms: number; end_ms: number } | null;
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
  transcriber_mode: string;
  demo_mode: boolean;
  demo_badge: string | null;
  numbered_chat: string;
  messages: { n: number; kind: string; sender: string | null; text: string; timestamp: string | null; voice: VoiceInfo | null }[];
  import_problems: { line: number; text: string }[];
  voice_problems: string[];
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
    const value: TermsRequest = { playbook_id: o.playbook_id, chat_text: o.chat_text };
    if (o.voice_notes !== undefined) {
      if (!Array.isArray(o.voice_notes)) return { ok: false, message: "voice_notes must be a list." };
      const notes: VoiceNoteInput[] = [];
      for (const n of o.voice_notes) {
        const r = n as Record<string, unknown> | null;
        if (typeof r !== "object" || r === null || typeof r.name !== "string" || typeof r.audio_base64 !== "string") {
          return { ok: false, message: "Each voice note needs a name and audio_base64." };
        }
        notes.push({ name: r.name, audio_base64: r.audio_base64 });
      }
      value.voice_notes = notes;
    }
    if (o.voice_corrections !== undefined) {
      const c = o.voice_corrections as Record<string, unknown> | null;
      if (typeof c !== "object" || c === null || Array.isArray(c) || !Object.values(c).every((v) => typeof v === "string")) {
        return { ok: false, message: "voice_corrections must map file names to text." };
      }
      value.voice_corrections = c as Record<string, string>;
    }
    return { ok: true, value };
  }
  if (o.voice_notes !== undefined && !(Array.isArray(o.voice_notes) && o.voice_notes.length === 0)) {
    return { ok: false, message: "Voice notes go with chat_text, not with a PDF." };
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

export interface PlaybookView {
  id: string;
  title: string;
  terms: { key: string; label: string; type: string; required: boolean }[];
}

export type PlaybooksResult = { status: number; body: { playbooks: PlaybookView[] } | { error: string; message: string } };

export async function requestPlaybooks(
  opts: { baseUrl?: string | undefined; fetchImpl?: typeof fetch } = { baseUrl: process.env.AI_SERVICE_URL }
): Promise<PlaybooksResult> {
  const baseUrl = "baseUrl" in opts ? opts.baseUrl : process.env.AI_SERVICE_URL;
  const fetchImpl = opts.fetchImpl ?? fetch;
  if (!baseUrl) return { status: 503, body: { error: "SERVER_MISCONFIGURED", message: "AI_SERVICE_URL is not set." } };
  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}/v1/playbooks`, { signal: AbortSignal.timeout(15_000) });
  } catch {
    return { status: 502, body: { error: "AI_SERVICE_UNAVAILABLE", message: "The analysis service could not be reached." } };
  }
  const body: unknown = res.ok ? await res.json().catch(() => null) : null;
  const list = typeof body === "object" && body !== null ? (body as { playbooks?: unknown }).playbooks : undefined;
  if (!Array.isArray(list)) return { status: 502, body: { error: "AI_SERVICE_ERROR", message: "The analysis service could not list the playbooks." } };
  return { status: 200, body: { playbooks: list as PlaybookView[] } };
}
