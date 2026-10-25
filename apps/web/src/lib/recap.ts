/**
 * Client for apps/ai-service POST /v1/recap: confirmed terms in, a fixed-template
 * recap and suggested messages out (docs/RECAP_DESIGN.md). Text only: no model, no
 * vault, no hash path. The echo code is added later, in the browser, from the
 * stored hash of the recap document (lib/echo-code.ts).
 */

import { aiFailure } from "./terms";

export type RecapLanguage = "en" | "hi";
export const RECAP_LANGUAGES: RecapLanguage[] = ["en", "hi"];

export interface RecapTermInput {
  key: string;
  status: string;
  value: string | null;
  quote: string[];
  msg: number[];
  confirmed: boolean;
}

export interface RecapRequest {
  playbook_id: string;
  language: RecapLanguage;
  other_name?: string;
  terms: RecapTermInput[];
}

export interface RecapResponse {
  language: RecapLanguage;
  title: string;
  text: string;
  lines: { key: string; label: string; text: string; msg: number[] }[];
  open_points: { key: string; label: string; status: string; text: string }[];
  suggestions: { key: string; label: string; status: string; messages: { friendly: string; neutral: string; firm: string } }[];
  reply_line: string;
  disclaimer: string;
}

export type RecapResult = { status: number; body: RecapResponse | { error: string; message: string } };

function parseTerm(t: unknown): RecapTermInput | null {
  if (typeof t !== "object" || t === null || Array.isArray(t)) return null;
  const o = t as Record<string, unknown>;
  if (typeof o.key !== "string" || typeof o.status !== "string") return null;
  if (!(o.value === null || o.value === undefined || typeof o.value === "string")) return null;
  if (!Array.isArray(o.quote) || !o.quote.every((q) => typeof q === "string")) return null;
  if (!Array.isArray(o.msg) || !o.msg.every((n) => typeof n === "number" && Number.isInteger(n))) return null;
  if (typeof o.confirmed !== "boolean") return null;
  return { key: o.key, status: o.status, value: (o.value as string | null | undefined) ?? null, quote: o.quote as string[], msg: o.msg as number[], confirmed: o.confirmed };
}

export function parseRecapRequest(input: unknown): { ok: true; value: RecapRequest } | { ok: false; message: string } {
  if (typeof input !== "object" || input === null || Array.isArray(input)) return { ok: false, message: "Expected a JSON object." };
  const o = input as Record<string, unknown>;
  if (typeof o.playbook_id !== "string" || o.playbook_id === "") return { ok: false, message: "playbook_id is required." };
  if (o.language !== "en" && o.language !== "hi") return { ok: false, message: 'language must be "en" or "hi".' };
  if (o.other_name !== undefined && typeof o.other_name !== "string") return { ok: false, message: "other_name must be text." };
  if (!Array.isArray(o.terms)) return { ok: false, message: "terms must be a list." };
  const terms: RecapTermInput[] = [];
  for (const raw of o.terms) {
    const t = parseTerm(raw);
    if (t === null) return { ok: false, message: "Each term needs key, status, value, quote, msg and confirmed." };
    terms.push(t);
  }
  const value: RecapRequest = { playbook_id: o.playbook_id, language: o.language, terms };
  if (typeof o.other_name === "string") value.other_name = o.other_name;
  return { ok: true, value: { playbook_id: value.playbook_id, language: value.language, ...(value.other_name !== undefined ? { other_name: value.other_name } : {}), terms: value.terms } };
}

function looksLikeRecap(b: unknown): b is RecapResponse {
  if (typeof b !== "object" || b === null) return false;
  const r = b as Record<string, unknown>;
  return typeof r.text === "string" && Array.isArray(r.lines) && Array.isArray(r.open_points) && Array.isArray(r.suggestions) && typeof r.reply_line === "string";
}

export async function requestRecap(
  req: RecapRequest,
  opts: { baseUrl?: string | undefined; fetchImpl?: typeof fetch } = { baseUrl: process.env.AI_SERVICE_URL }
): Promise<RecapResult> {
  const baseUrl = "baseUrl" in opts ? opts.baseUrl : process.env.AI_SERVICE_URL;
  const fetchImpl = opts.fetchImpl ?? fetch;
  if (!baseUrl) return { status: 503, body: { error: "SERVER_MISCONFIGURED", message: "AI_SERVICE_URL is not set." } };
  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}/v1/recap`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    return { status: 502, body: { error: "AI_SERVICE_UNAVAILABLE", message: "The recap service could not be reached." } };
  }
  const body: unknown = await res.json().catch(() => null);
  if (res.ok) {
    if (!looksLikeRecap(body)) return { status: 502, body: { error: "AI_SERVICE_BAD_RESPONSE", message: "The recap service sent an answer in an unexpected format." } };
    return { status: 200, body };
  }
  return aiFailure(res.status, body);
}
