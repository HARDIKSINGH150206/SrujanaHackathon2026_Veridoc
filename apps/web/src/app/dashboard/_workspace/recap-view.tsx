"use client";

/**
 * Recap screen (docs/RECAP_DESIGN.md). Text comes from fixed templates, filled only
 * from the terms the person confirmed on Chat terms. Saving builds a PDF in the
 * browser and uploads it through the normal evidence upload; the echo code is then
 * derived from the stored hash of that document. Nothing here is model text.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/client/auth-context";
import { apiJson, ApiError } from "@/lib/client/api-client";
import { can } from "@/lib/client/permissions";
import { uploadPdfAsEvidence } from "@/lib/client/evidence-upload";
import { loadDraft, type RecapDraft } from "@/lib/client/recap-draft";
import { checkReply, echoCode, replyLine, type ReplyCheck } from "@/lib/echo-code";
import { buildRecapPdf } from "@/lib/recap-pdf";
import type { RecapLanguage, RecapResponse } from "@/lib/recap";
import type { CaseRow } from "./data";
import { WorkspaceShell } from "./shell";

const FONT_URL = "/fonts/NotoSans-Latin-Devanagari-subset.ttf";
const TONES = [
  { id: "friendly", label: "Friendly" },
  { id: "neutral", label: "Neutral" },
  { id: "firm", label: "Firm" },
] as const;
type Tone = (typeof TONES)[number]["id"];
const STATUS_LABEL: Record<string, string> = {
  unclear: "Unclear",
  contradicted: "Contradicted",
  missing: "Missing",
  needs_review: "Needs review",
  unconfirmed: "Not confirmed",
};

const RECAP_CSS = `
.rc { max-width: 760px; }
.rc-badge { display: inline-block; margin: 16px 0 0; padding: 6px 12px; border-radius: 8px; background: #facc15; color: #1a1a1a; font-weight: 600; font-size: 13px; }
.rc-note { margin: 12px 0 0; color: var(--paper-3); font-size: 14px; max-width: 70ch; }
.rc-row { display: flex; gap: 16px; flex-wrap: wrap; margin-top: 24px; }
.rc-row label { display: grid; gap: 6px; font-size: 13px; color: var(--paper-3); min-width: 200px; flex: 1; }
.rc-h2 { margin: 36px 0 0; font-size: 18px; font-weight: 500; }
.rc-text { margin: 12px 0 0; padding: 16px 18px; border: 1px solid var(--line-2); border-radius: 10px; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 15px; line-height: 1.6; background: var(--ink-2); }
.rc-sug { margin: 14px 0 0; padding: 14px 16px; border: 1px solid var(--line-2); border-radius: 10px; }
.rc-sug-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-weight: 500; font-size: 14px; }
.rc-sug-msg { margin: 8px 0 0; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 14px; color: var(--paper-2); }
.rc-tones { display: inline-flex; gap: 6px; margin-top: 12px; flex-wrap: wrap; }
.rc-tone { padding: 4px 12px; border-radius: 999px; border: 1px solid var(--line-2); background: transparent; color: var(--paper-2); font-size: 13px; cursor: pointer; }
.rc-tone[aria-pressed=true] { background: var(--paper); color: var(--ink); border-color: var(--paper); }
.rc-actions { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
.rc-code { display: inline-block; margin-top: 12px; padding: 10px 16px; border: 1px solid var(--line-3); border-radius: 10px; font-size: 28px; letter-spacing: 0.18em; font-variant-numeric: tabular-nums; font-family: ui-monospace, monospace; }
.rc-result { margin: 14px 0 0; padding: 12px 14px; border-radius: 10px; border: 1px solid var(--line-2); font-size: 14px; }
.rc-ok { border-color: var(--ok); }
.rc-bad { border-color: var(--warn); }
.rc-limit { margin: 10px 0 0; color: var(--paper-3); font-size: 13px; max-width: 70ch; }
.rc-reply { width: 100%; min-height: 90px; font-family: inherit; margin-top: 10px; }
@media (max-width: 720px) { .rc-code { font-size: 22px; } }
`;

type Saved = { documentId: string; versionId: string; code: string; text: string };
const SAVED_KEY = "veridoc.recap.saved";

function readSaved(): Saved | null {
  try {
    const raw = window.sessionStorage.getItem(SAVED_KEY);
    const o = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
    if (o && ["documentId", "versionId", "code", "text"].every((k) => typeof o[k] === "string")) return o as unknown as Saved;
  } catch {
    // storage blocked or damaged
  }
  return null;
}

async function copy(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

export function RecapView() {
  const { session } = useAuth();
  const canSave = can(session?.role, "uploadEvidence");
  const [draft, setDraft] = useState<RecapDraft | null | undefined>(undefined);
  const [language, setLanguage] = useState<RecapLanguage>("en");
  const [otherName, setOtherName] = useState("");
  const [recap, setRecap] = useState<RecapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tone, setTone] = useState<Tone>("friendly");
  const [copied, setCopied] = useState<string | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [caseId, setCaseId] = useState("");
  const [title, setTitle] = useState("Recap");
  const [phase, setPhase] = useState<string | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [reply, setReply] = useState("");
  const [check, setCheck] = useState<ReplyCheck | null>(null);

  useEffect(() => {
    setDraft(loadDraft(window.sessionStorage));
    setSaved(readSaved());
  }, []);

  useEffect(() => {
    apiJson<{ cases: CaseRow[] }>("/api/v1/cases")
      .then((r) => {
        setCases(r.cases);
        setCaseId((cur) => cur || (r.cases[0]?.id ?? ""));
      })
      .catch(() => setCases([]));
  }, []);

  useEffect(() => {
    if (!draft || saved) return;
    let live = true;
    const timer = setTimeout(() => {
      apiJson<RecapResponse>("/api/v1/evidence/recap", {
        method: "POST",
        body: JSON.stringify({ playbook_id: draft.playbook_id, language, ...(otherName.trim() ? { other_name: otherName.trim() } : {}), terms: draft.terms }),
      })
        .then((r) => {
          if (live) {
            setRecap(r);
            setError(null);
          }
        })
        .catch((err) => {
          if (live) setError(err instanceof ApiError ? err.message : "Could not write the recap.");
        });
    }, 250);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [draft, language, otherName, saved]);

  async function copyText(id: string, text: string) {
    await copy(text);
    setCopied(id);
    setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
  }

  async function save() {
    if (!recap || !caseId) return;
    setError(null);
    try {
      setPhase("Building the recap document…");
      const fontBytes = new Uint8Array(await (await fetch(FONT_URL)).arrayBuffer());
      const pdf = await buildRecapPdf({ title: recap.title, text: recap.text, disclaimer: recap.disclaimer }, fontBytes);
      const up = await uploadPdfAsEvidence(pdf, { caseId, title: title.trim() || "Recap", docType: "RECAP" }, (p) =>
        setPhase(p === "hashing" ? "Fingerprinting the pages in your browser…" : "Uploading. The server is re-checking every fingerprint…")
      );
      const code = await echoCode(up.client_hash);
      const next: Saved = { documentId: up.document_id, versionId: up.document_version_id, code, text: recap.text + "\n\n" + replyLine(recap.reply_line, code) };
      try {
        window.sessionStorage.setItem(SAVED_KEY, JSON.stringify(next));
      } catch {
        // the code is still shown; it just will not survive a reload
      }
      setSaved(next);
      setPhase(null);
    } catch (err) {
      setPhase(null);
      setError(err instanceof Error ? err.message : "Could not save the recap.");
    }
  }

  function startAgain() {
    try {
      window.sessionStorage.removeItem(SAVED_KEY);
    } catch {
      // ignore
    }
    setSaved(null);
    setReply("");
    setCheck(null);
  }

  const savedPanel = saved && (
    <>
      <h2 className="rc-h2">The recap, as saved</h2>
      <div className="rc-text" aria-label="Recap text">
        {saved.text}
      </div>
      <p className="rc-note">
        Saved. <Link href={`/dashboard/documents/${saved.documentId}/versions/${saved.versionId}`}>Open the saved version</Link> to see its fingerprint and anchor.
      </p>
      <div>
        <div className="rc-note" style={{ marginTop: 16 }}>Confirmation code</div>
        <span className="rc-code" aria-label="Confirmation code">{saved.code}</span>
      </div>
      <div className="rc-actions">
        <button type="button" className="ws-primary" onClick={() => copyText("wa", saved.text)}>
          {copied === "wa" ? "Copied" : "Copy the WhatsApp message"}
        </button>
        <button type="button" className="ws-secondary" onClick={startAgain}>
          Start again
        </button>
      </div>

      <h2 className="rc-h2">Check a reply</h2>
      <p className="rc-note">Paste the reply you got on WhatsApp.</p>
      <textarea className="ws-input rc-reply" aria-label="Pasted reply" value={reply} onChange={(e) => { setReply(e.target.value); setCheck(null); }} placeholder="CONFIRM …" />
      <div className="rc-actions">
        <button type="button" className="ws-primary" disabled={reply.trim() === ""} onClick={() => setCheck(checkReply(reply, saved.code))}>
          Check the reply
        </button>
      </div>
      {check && (
        <div role="status" className={`rc-result ${check.result === "match" ? "rc-ok" : "rc-bad"}`} data-result={check.result}>
          {check.message}
        </div>
      )}
      <p className="rc-limit">
        A matching code shows that the reply refers to this exact recap. It does not show who sent it, and it does not make the agreement enforceable.
      </p>
    </>
  );

  return (
    <WorkspaceShell active={null} extraCss={RECAP_CSS}>
      <div className="rc">
        <h1 className="ws-title">Recap</h1>
        <p className="rc-note">
          A short summary of the terms you confirmed, written from fixed templates, with what is still open. Drafting aid, not legal advice. Read every line before you send it.
        </p>
        {draft?.demo_badge && <div className="rc-badge">{draft.demo_badge}</div>}

        {saved ? (
          savedPanel
        ) : draft === undefined ? (
          <p className="rc-note">Loading…</p>
        ) : draft === null ? (
          <p className="rc-note">
            There is nothing to write yet. Start from <Link href="/dashboard/terms">Chat terms</Link>, confirm the terms you agree with, then choose “Write the recap”.
          </p>
        ) : (
          <>
            <div className="rc-row">
              <label>
                Language
                <select className="ws-input" value={language} onChange={(e) => setLanguage(e.target.value as RecapLanguage)}>
                  <option value="en">English</option>
                  <option value="hi">हिन्दी (draft)</option>
                </select>
              </label>
              <label>
                The other person’s name (optional)
                <input className="ws-input" list="rc-senders" maxLength={60} value={otherName} onChange={(e) => setOtherName(e.target.value)} />
                <datalist id="rc-senders">
                  {draft.senders.map((sender) => (
                    <option key={sender} value={sender} />
                  ))}
                </datalist>
              </label>
            </div>

            {error && (
              <p role="alert" className="rc-note" style={{ color: "var(--warn)" }}>
                {error}
              </p>
            )}

            {recap && (
              <>
                <h2 className="rc-h2">The recap</h2>
                <div className="rc-text" lang={language} aria-label="Recap text">
                  {recap.text}
                </div>
                <div className="rc-actions">
                  <button type="button" className="ws-secondary" onClick={() => copyText("recap", recap.text)}>
                    {copied === "recap" ? "Copied" : "Copy the recap"}
                  </button>
                </div>

                {recap.suggestions.length > 0 && (
                  <>
                    <h2 className="rc-h2">What to ask next</h2>
                    <p className="rc-note">One suggested message for each open point. You send it yourself; VeriDoc sends nothing.</p>
                    <div className="rc-tones" role="group" aria-label="Tone">
                      {TONES.map((t) => (
                        <button key={t.id} type="button" className="rc-tone" aria-pressed={tone === t.id} onClick={() => setTone(t.id)}>
                          {t.label}
                        </button>
                      ))}
                    </div>
                    {recap.suggestions.map((sg) => (
                      <div className="rc-sug" key={sg.key}>
                        <div className="rc-sug-head">
                          {sg.label} <span className="ws-chip ws-chip-warn">{STATUS_LABEL[sg.status] ?? sg.status}</span>
                        </div>
                        <p className="rc-sug-msg" lang={language}>
                          {sg.messages[tone]}
                        </p>
                        <div className="rc-actions">
                          <button type="button" className="ws-secondary" onClick={() => copyText(`s-${sg.key}`, sg.messages[tone])}>
                            {copied === `s-${sg.key}` ? "Copied" : "Copy this message"}
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}

                <h2 className="rc-h2">Save the recap and get the code</h2>
                <p className="rc-note">
                  The recap is saved as a document in the vault through the normal upload: hashed in your browser, checked again by the server, chained to earlier versions and anchored. The confirmation code is worked out from that document’s hash.
                </p>
                <div className="rc-row">
                  <label>
                    Agreement
                    <select className="ws-input" value={caseId} onChange={(e) => setCaseId(e.target.value)} disabled={cases.length === 0}>
                      {cases.length === 0 && <option value="">No agreement yet: create one on the dashboard</option>}
                      {cases.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.case_number}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Document title
                    <input className="ws-input" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} />
                  </label>
                </div>
                <div className="rc-actions">
                  <button type="button" className="ws-primary" disabled={!canSave || !caseId || phase !== null} onClick={save}>
                    {phase ?? "Save recap and get the code"}
                  </button>
                  {!canSave && <span className="rc-note" style={{ margin: 0 }}>Your role cannot upload documents.</span>}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </WorkspaceShell>
  );
}
