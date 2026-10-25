"use client";

/**
 * Proposed terms from a chat. Calls POST /api/v1/evidence/terms, which only
 * suggests (CLAUDE.md rule 2): nothing on this page is saved, and nothing here
 * is evidence until a person confirms it and it is uploaded the normal way.
 * Shows "Demo mode: recorded model output" whenever the service says the model is fake.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiJson, ApiError } from "@/lib/client/api-client";
import { useAuth } from "@/lib/client/auth-context";
import { uploadPdfAsEvidence } from "@/lib/client/evidence-upload";
import { can } from "@/lib/client/permissions";
import { saveDraft } from "@/lib/client/recap-draft";
import { rangeLabel, reachedEnd } from "@/lib/client/voice-range";
import { buildChatRecordContent } from "@/lib/chat-record";
import { buildRecapPdf } from "@/lib/recap-pdf";
import type { FlagView, PlaybookView, TermSource, TermStatus, TermView, TermsResponse, VoiceNoteInput } from "@/lib/terms";
import type { CaseRow } from "./data";
import { WorkspaceShell } from "./shell";

const AUDIO_EXTENSIONS = [".opus", ".m4a", ".wav"];
const FONT_URL = "/fonts/NotoSans-Latin-Devanagari-subset.ttf";
const baseName = (f: File) => f.name.split("/").pop() ?? f.name;

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
.tv-msgs > li { display: grid; grid-template-columns: 44px 1fr; gap: 8px; padding: 4px 6px; border-radius: 6px; }
.tv-msgs li:target { background: var(--ink-3); outline: 1px solid var(--line-3); }
.tv-n { color: var(--paper-4); font-variant-numeric: tabular-nums; }
.tv-kind { color: var(--paper-4); font-style: italic; }
.tv-h2 { margin: 32px 0 0; font-size: 18px; font-weight: 500; }
.tv-cell-label { display: none; }
.tv-voice { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-top: 4px; font-size: 12px; color: var(--paper-2); }
.tv-voice-tag { padding: 1px 8px; border: 1px solid var(--line-3); border-radius: 999px; }
.tv-play { padding: 2px 10px; border-radius: 999px; border: 1px solid var(--line-3); background: transparent; color: var(--paper); font-size: 12px; cursor: pointer; }
.tv-play:disabled { color: var(--paper-4); cursor: not-allowed; }
.tv-spans { margin: 6px 0 0; padding: 0; list-style: none; font-size: 12px; color: var(--paper-3); }
.tv-fix { width: 100%; min-height: 56px; margin-top: 6px; font-family: inherit; }
@media (max-width: 720px) {
  .tv-table, .tv-table tbody, .tv-table tr, .tv-table td { display: block; width: 100%; }
  .tv-table thead { display: none; }
  .tv-table tr { padding: 12px 0; border-bottom: 1px solid var(--line-2); }
  .tv-table td { border: 0; padding: 4px 0; }
  .tv-cell-label { display: block; font-size: 12px; color: var(--paper-4); margin-bottom: 2px; }
  .tv-msgs > li { grid-template-columns: 36px minmax(0, 1fr); overflow-wrap: anywhere; }
}
`;

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

function TermRow({ t, flags, confirmed, onToggle, canPlay, onPlay }: { t: TermView; flags: FlagView[]; confirmed: boolean; onToggle: (key: string) => void; canPlay: (name: string) => boolean; onPlay: (v: NonNullable<TermSource["voice"]>) => void }) {
  return (
    <tr>
      <td>
        <strong>{t.label}</strong>
        {!t.required && <div className="tv-opt">optional</div>}
      </td>
      <td>
        <span className="tv-cell-label">Status</span>
        <span className={`ws-chip ${STATUS_CLASS[t.status]}`}>{STATUS_LABEL[t.status]}</span>
        {t.status === "stated" && t.value !== null && (
          <label className="tv-confirm">
            <input type="checkbox" checked={confirmed} onChange={() => onToggle(t.key)} aria-label={`Confirm ${t.label}`} /> Confirm
          </label>
        )}
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
            {s.voice && (
              <div className="tv-voice" data-testid="voice-source">
                <span className="tv-voice-tag">from voice note</span>
                <span>{rangeLabel(s.voice.start_ms, s.voice.end_ms)}</span>
                <button type="button" className="tv-play" disabled={!canPlay(s.voice.name)} onClick={() => onPlay(s.voice!)} aria-label={`Play the moment: ${s.voice.name}, ${rangeLabel(s.voice.start_ms, s.voice.end_ms)}`}>
                  Play the moment
                </button>
              </div>
            )}
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
  const [folder, setFolder] = useState<File[]>([]);
  const [corrections, setCorrections] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [cases, setCases] = useState<CaseRow[]>([]);
  const [caseId, setCaseId] = useState("");
  const [recordPhase, setRecordPhase] = useState<string | null>(null);
  const [savedRecord, setSavedRecord] = useState<{ documentId: string; versionId: string } | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urls = useRef<Map<string, string>>(new Map());
  const { session } = useAuth();
  const canSave = can(session?.role, "uploadEvidence");
  const voiceFiles = useMemo(() => new Map(folder.filter((f) => AUDIO_EXTENSIONS.some((e) => f.name.toLowerCase().endsWith(e))).map((f) => [baseName(f), f])), [folder]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TermsResponse | null>(null);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const router = useRouter();

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

  async function runAnalysis(fixes: Record<string, string>) {
    setBusy(true);
    setError(null);
    setResult(null);
    setConfirmed(new Set());
    setSavedRecord(null);
    try {
      let body: { playbook_id: string; chat_text?: string; pdf_base64?: string; voice_notes?: VoiceNoteInput[]; voice_corrections?: Record<string, string> };
      if (folder.length > 0) {
        const chat = folder.find((f) => baseName(f).toLowerCase().endsWith(".txt"));
        if (!chat) throw new ApiError(400, { message: "That folder has no WhatsApp chat (.txt) file." });
        const notes: VoiceNoteInput[] = [];
        for (const [name, f] of voiceFiles) notes.push({ name, audio_base64: toBase64(await f.arrayBuffer()) });
        body = { playbook_id: playbook, chat_text: await chat.text(), voice_notes: notes };
        if (Object.keys(fixes).length > 0) body.voice_corrections = fixes;
      } else if (file && /\.pdf$/i.test(file.name)) body = { playbook_id: playbook, pdf_base64: toBase64(await file.arrayBuffer()) };
      else if (file) body = { playbook_id: playbook, chat_text: await file.text() };
      else body = { playbook_id: playbook, chat_text: text };
      setResult(await apiJson<TermsResponse>("/api/v1/evidence/terms", { method: "POST", body: JSON.stringify(body) }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not analyse the chat.");
    } finally {
      setBusy(false);
    }
  }

  function analyse(e: React.FormEvent) {
    e.preventDefault();
    setCorrections({});
    setEditing(null);
    void runAnalysis({});
  }

  function playMoment(v: NonNullable<TermSource["voice"]>) {
    const f = voiceFiles.get(v.name);
    if (!f) return;
    let url = urls.current.get(v.name);
    if (!url) {
      url = URL.createObjectURL(f);
      urls.current.set(v.name, url);
    }
    const a = audioRef.current ?? new Audio();
    audioRef.current = a;
    a.pause();
    a.ontimeupdate = null;
    if (a.dataset.name !== v.name) {
      a.src = url;
      a.dataset.name = v.name;
    }
    const start = () => {
      a.currentTime = v.start_ms / 1000;
      a.ontimeupdate = () => {
        if (reachedEnd(a.currentTime, v.end_ms)) {
          a.pause();
          a.ontimeupdate = null;
        }
      };
      void a.play();
    };
    if (a.readyState >= 1) start();
    else a.addEventListener("loadedmetadata", start, { once: true });
  }

  useEffect(() => {
    const map = urls.current;
    return () => {
      audioRef.current?.pause();
      map.forEach((u) => URL.revokeObjectURL(u));
    };
  }, []);

  useEffect(() => {
    if (!result || !canSave) return;
    apiJson<{ cases: CaseRow[] }>("/api/v1/cases")
      .then((r) => {
        setCases(r.cases);
        setCaseId((cur) => cur || (r.cases[0]?.id ?? ""));
      })
      .catch(() => setCases([]));
  }, [result, canSave]);

  async function saveRecord() {
    if (!result || !caseId) return;
    setError(null);
    try {
      setRecordPhase("Building the chat record…");
      const fontBytes = new Uint8Array(await (await fetch(FONT_URL)).arrayBuffer());
      const pdf = await buildRecapPdf(buildChatRecordContent(result), fontBytes);
      const up = await uploadPdfAsEvidence(pdf, { caseId, title: "Chat record", docType: "Chat record" }, (p) =>
        setRecordPhase(p === "hashing" ? "Fingerprinting the pages in your browser…" : "Uploading. The server is re-checking every fingerprint…")
      );
      setSavedRecord({ documentId: up.document_id, versionId: up.document_version_id });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the chat record.");
    } finally {
      setRecordPhase(null);
    }
  }

  const toggle = (key: string) =>
    setConfirmed((cur) => {
      const next = new Set(cur);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  function makeRecap() {
    if (!result) return;
    const senders = [...new Set(result.messages.filter((m) => (m.kind === "message" || m.kind === "voice") && m.sender).map((m) => m.sender as string))];
    saveDraft(window.sessionStorage, {
      playbook_id: result.playbook_id,
      demo_badge: result.demo_mode ? result.demo_badge : null,
      senders,
      terms: result.report.terms.map((t) => ({
        key: t.key,
        status: t.status,
        value: t.value,
        quote: t.quote,
        msg: t.msg,
        confirmed: t.status === "stated" && confirmed.has(t.key),
      })),
    });
    router.push("/dashboard/recap");
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
          <input type="file" accept=".txt,.pdf,text/plain,application/pdf" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setFolder([]); }} />
        </label>
        <label>
          Or a WhatsApp export folder (the chat and its voice notes: .opus, .m4a, .wav)
          <input
            type="file"
            aria-label="WhatsApp export folder"
            {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
            multiple
            onChange={(e) => {
              setFolder(Array.from(e.target.files ?? []));
              setFile(null);
            }}
          />
        </label>
        <label>
          Or paste the chat
          <textarea className="ws-input" value={text} disabled={file !== null || folder.length > 0} onChange={(e) => setText(e.target.value)} placeholder="12/03/2026, 10:02 - Name: message" />
        </label>
        <div>
          <button type="submit" className="ws-primary" disabled={busy || !playbook || (!file && folder.length === 0 && text.trim() === "")}>
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
          {result.voice_problems.map((p) => (
            <p className="tv-note" key={p} role="status">
              {p}
            </p>
          ))}
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
                <TermRow key={t.key} t={t} flags={flagsFor(t.key)} confirmed={confirmed.has(t.key)} onToggle={toggle} canPlay={(n) => voiceFiles.has(n)} onPlay={playMoment} />
              ))}
            </tbody>
          </table>

          <div className="tv-actions">
            <button type="button" className="ws-primary" onClick={makeRecap}>
              Write the recap ({confirmed.size} confirmed)
            </button>
            <span className="tv-note" style={{ margin: 0 }}>
              Only stated terms can be confirmed. Everything else becomes an open point in the recap.
            </span>
          </div>

          {canSave && (
            <>
              <h2 className="tv-h2">Save the chat record</h2>
              <p className="tv-note">
                Saves the numbered chat as a document through the normal upload. Each voice note is listed with the SHA-256 of its raw audio, so the fingerprint is covered by the hash chain and the anchor. The audio itself is not stored in the vault.
              </p>
              <div className="tv-actions">
                <select className="ws-input" aria-label="Agreement for the chat record" value={caseId} onChange={(e) => setCaseId(e.target.value)} disabled={cases.length === 0}>
                  {cases.length === 0 && <option value="">No agreement yet</option>}
                  {cases.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.case_number}
                    </option>
                  ))}
                </select>
                <button type="button" className="ws-secondary" disabled={!caseId || recordPhase !== null} onClick={saveRecord}>
                  {recordPhase ?? "Save the chat record"}
                </button>
              </div>
              {savedRecord && (
                <p className="tv-note" role="status" data-testid="record-saved">
                  Saved. <a href={`/dashboard/documents/${savedRecord.documentId}/versions/${savedRecord.versionId}`}>Open the saved version</a>.
                </p>
              )}
            </>
          )}

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
                  ) : m.kind === "voice" && m.voice ? (
                    <>
                      <strong>{m.sender}:</strong> <span className="tv-voice-tag">voice note</span> {m.text}
                      <ul className="tv-spans">
                        {m.voice.segments.map((sg) => (
                          <li key={sg.start_ms}>
                            {rangeLabel(sg.start_ms, sg.end_ms)}: {sg.text}
                          </li>
                        ))}
                      </ul>
                      <div className="tv-src">
                        {m.voice.name} · SHA-256 {m.voice.sha256.slice(0, 16)}… · the transcript is a suggestion{m.voice.corrected ? " (corrected by you)" : ""}
                        {result.transcriber_mode === "fake" ? " · recorded transcript" : ""}
                      </div>
                      <div className="tv-voice">
                        <button type="button" className="tv-play" disabled={!voiceFiles.has(m.voice.name)} onClick={() => playMoment({ name: m.voice!.name, sha256: m.voice!.sha256, start_ms: m.voice!.segments[0].start_ms, end_ms: m.voice!.segments[m.voice!.segments.length - 1].end_ms })}>
                          Play
                        </button>
                        <button type="button" className="tv-play" onClick={() => setEditing(editing === m.voice!.name ? null : m.voice!.name)}>
                          Correct the transcript
                        </button>
                      </div>
                      {editing === m.voice.name && (
                        <>
                          <textarea
                            className="ws-input tv-fix"
                            aria-label={`Corrected transcript for ${m.voice.name}`}
                            defaultValue={corrections[m.voice.name] ?? m.text}
                            onChange={(e) => setCorrections((c) => ({ ...c, [m.voice!.name]: e.target.value }))}
                          />
                          <div className="tv-voice">
                            <button
                              type="button"
                              className="ws-primary"
                              disabled={busy}
                              onClick={() => {
                                setEditing(null);
                                void runAnalysis(corrections);
                              }}
                            >
                              Find terms again with this correction
                            </button>
                          </div>
                        </>
                      )}
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
