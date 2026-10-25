"use client";

/**
 * Proposed terms from a chat. Calls POST /api/v1/evidence/terms, which only
 * suggests (CLAUDE.md rule 2): nothing on this page is saved, and nothing here
 * is evidence until a person confirms it and it is uploaded the normal way.
 * Shows "Demo mode: recorded model output" whenever the service says the model is fake.
 */

import { useEffect, useState } from "react";
import { apiJson, ApiError } from "@/lib/client/api-client";
import type { FlagView, PlaybookView, TermStatus, TermView, TermsResponse } from "@/lib/terms";
import { WorkspaceShell } from "./shell";

const STATUS_LABEL: Record<TermStatus, string> = {
  stated: "Stated",
  unclear: "Unclear",
  contradicted: "Contradicted",
  missing: "Missing",
  needs_review: "Needs review",
};
const STATUS_CLASS: Record<TermStatus, string> = {
  stated: "ws-chip-ok",
  unclear: "ws-chip-warn",
  contradicted: "ws-chip-warn",
  missing: "ws-chip-neutral",
  needs_review: "ws-chip-warn",
};

const TERMS_CSS = `
.tv-badge { display: inline-block; margin: 16px 0 0; padding: 6px 12px; border-radius: 8px; background: #facc15; color: #1a1a1a; font-weight: 600; font-size: 13px; }
.tv-note { margin: 12px 0 0; color: var(--paper-3); font-size: 14px; max-width: 70ch; }
.tv-form { display: grid; gap: 14px; margin-top: 24px; max-width: 720px; }
.tv-form label { display: grid; gap: 6px; font-size: 13px; color: var(--paper-3); }
.tv-form textarea { min-height: 140px; resize: vertical; font-family: inherit; }
.tv-table { width: 100%; border-collapse: collapse; margin-top: 24px; }
.tv-table th { text-align: left; font-size: 12px; font-weight: 500; color: var(--paper-3); padding: 8px 10px; border-bottom: 1px solid var(--line-2); }
.tv-table td { vertical-align: top; padding: 12px 10px; border-bottom: 1px solid var(--line-2); font-size: 14px; }
.tv-opt { color: var(--paper-4); font-size: 12px; }
.tv-quote { margin: 0; padding-left: 10px; border-left: 2px solid var(--line-3); color: var(--paper-2); }
.tv-src { margin-top: 4px; font-size: 12px; color: var(--paper-3); }
.tv-src a { color: inherit; text-decoration: underline; }
.tv-problems { margin: 6px 0 0; padding-left: 18px; color: var(--paper-2); font-size: 13px; }
.tv-flags { margin: 24px 0 0; padding: 0; list-style: none; display: grid; gap: 8px; }
.tv-flags li { font-size: 14px; color: var(--paper-2); }
.tv-msgs { margin: 12px 0 0; padding: 0; list-style: none; display: grid; gap: 4px; font-size: 14px; }
.tv-msgs li { display: grid; grid-template-columns: 44px 1fr; gap: 8px; padding: 4px 6px; border-radius: 6px; }
.tv-msgs li:target { background: var(--ink-3); outline: 1px solid var(--line-3); }
.tv-n { color: var(--paper-4); font-variant-numeric: tabular-nums; }
.tv-kind { color: var(--paper-4); font-style: italic; }
.tv-h2 { margin: 32px 0 0; font-size: 18px; font-weight: 500; }
.tv-cell-label { display: none; }
@media (max-width: 720px) {
  .tv-table, .tv-table tbody, .tv-table tr, .tv-table td { display: block; width: 100%; }
  .tv-table thead { display: none; }
  .tv-table tr { padding: 12px 0; border-bottom: 1px solid var(--line-2); }
  .tv-table td { border: 0; padding: 4px 0; }
  .tv-cell-label { display: block; font-size: 12px; color: var(--paper-4); margin-bottom: 2px; }
  .tv-msgs li { grid-template-columns: 36px minmax(0, 1fr); overflow-wrap: anywhere; }
}
`;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function TermRow({ t, flags }: { t: TermView; flags: FlagView[] }) {
  return (
    <tr>
      <td>
        <strong>{t.label}</strong>
        {!t.required && <div className="tv-opt">optional</div>}
      </td>
      <td>
        <span className="tv-cell-label">Status</span>
        <span className={`ws-chip ${STATUS_CLASS[t.status]}`}>{STATUS_LABEL[t.status]}</span>
      </td>
      <td>
        <span className="tv-cell-label">Value</span>
        {t.value ?? "–"}
      </td>
      <td>
        <span className="tv-cell-label">Where it comes from</span>
        {t.sources.length === 0 && <span className="tv-opt">No message cited</span>}
        {t.sources.map((s, i) => (
          <div key={`${s.msg}-${i}`} style={{ marginBottom: 8 }}>
            <blockquote className="tv-quote">{s.quote}</blockquote>
            <div className="tv-src">
              <a href={`#msg-${s.msg}`}>Message {s.msg}</a>
              {s.sender ? ` · ${s.sender}` : ""}
            </div>
          </div>
        ))}
        <div className="tv-src">{t.reason}</div>
        {flags.length > 0 && (
          <ul className="tv-problems">
            {flags.map((f) => (
              <li key={`${f.id}-${f.msg.join(",")}`}>
                <strong>{f.id.replace(/_/g, " ")}:</strong> {f.reason}
              </li>
            ))}
          </ul>
        )}
      </td>
    </tr>
  );
}

export function TermsView() {
  const [playbooks, setPlaybooks] = useState<PlaybookView[] | null>(null);
  const [playbook, setPlaybook] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TermsResponse | null>(null);

  useEffect(() => {
    let live = true;
    apiJson<{ playbooks: PlaybookView[] }>("/api/v1/evidence/playbooks")
      .then((r) => {
        if (!live) return;
        setPlaybooks(r.playbooks);
        setPlaybook((cur) => cur || (r.playbooks[0]?.id ?? ""));
      })
      .catch((err) => {
        if (!live) return;
        setPlaybooks([]);
        setError(err instanceof ApiError ? err.message : "Could not load the kinds of agreement.");
      });
    return () => {
      live = false;
    };
  }, []);

  async function analyse(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      let body: { playbook_id: string; chat_text?: string; pdf_base64?: string };
      if (file && /\.pdf$/i.test(file.name)) body = { playbook_id: playbook, pdf_base64: toBase64(await file.arrayBuffer()) };
      else if (file) body = { playbook_id: playbook, chat_text: await file.text() };
      else body = { playbook_id: playbook, chat_text: text };
      setResult(await apiJson<TermsResponse>("/api/v1/evidence/terms", { method: "POST", body: JSON.stringify(body) }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not analyse the chat.");
    } finally {
      setBusy(false);
    }
  }

  const flagsFor = (key: string) => (result ? result.report.flags.filter((f) => f.term === key) : []);

  return (
    <WorkspaceShell active="terms" extraCss={TERMS_CSS}>
      <h1 className="ws-title">Terms from a chat</h1>
      <p className="tv-note">
        These are suggestions. Check each one against the message it came from. Nothing on this page is saved or counted as evidence until you confirm it.
      </p>

      <form className="tv-form" onSubmit={analyse} aria-label="Analyse a chat">
        <label>
          Kind of agreement
          <select className="ws-input" value={playbook} disabled={!playbooks || playbooks.length === 0} onChange={(e) => setPlaybook(e.target.value)}>
            {(playbooks ?? []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.title}
              </option>
            ))}
          </select>
        </label>
        <label>
          WhatsApp export (a .txt file, or a text PDF)
          <input type="file" accept=".txt,.pdf,text/plain,application/pdf" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <label>
          Or paste the chat
          <textarea className="ws-input" value={text} disabled={file !== null} onChange={(e) => setText(e.target.value)} placeholder="12/03/2026, 10:02 - Name: message" />
        </label>
        <div>
          <button type="submit" className="ws-primary" disabled={busy || !playbook || (!file && text.trim() === "")}>
            {busy ? "Analysing…" : "Find terms"}
          </button>
        </div>
      </form>

      {error && (
        <p role="alert" className="tv-note" style={{ color: "var(--warn)" }}>
          {error}
        </p>
      )}

      {result && (
        <section aria-label="Proposed terms">
          {result.demo_mode && result.demo_badge && <div className="tv-badge">{result.demo_badge}</div>}
          {result.import_problems.length > 0 && (
            <p className="tv-note">
              {result.import_problems.length} line(s) before the first message were not part of any message and were left out (first: line {result.import_problems[0].line}).
            </p>
          )}
          {result.report.model_error && <p className="tv-note">The model could not be run: {result.report.model_error}</p>}
          <table className="tv-table">
            <thead>
              <tr>
                <th>Term</th>
                <th>Status</th>
                <th>Value</th>
                <th>Where it comes from</th>
              </tr>
            </thead>
            <tbody>
              {result.report.terms.map((t) => (
                <TermRow key={t.key} t={t} flags={flagsFor(t.key)} />
              ))}
            </tbody>
          </table>

          <h2 className="tv-h2">The chat, numbered</h2>
          <ol className="tv-msgs">
            {result.messages.map((m) => (
              <li key={m.n} id={`msg-${m.n}`}>
                <span className="tv-n">[{m.n}]</span>
                <span>
                  {m.kind === "message" ? (
                    <>
                      <strong>{m.sender}:</strong> {m.text}
                    </>
                  ) : (
                    <span className="tv-kind">
                      {m.kind === "system" ? "system notice" : m.kind === "deleted" ? `${m.sender}: deleted message` : `${m.sender}: media omitted`}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </WorkspaceShell>
  );
}
