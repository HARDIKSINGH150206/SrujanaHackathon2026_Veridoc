import { rangeLabel } from "./client/voice-range";
import type { TermsResponse } from "./terms";

/**
 * Text of the chat record that is saved through the normal evidence upload (ADR-040): the numbered
 * chat, then one entry per voice note with the SHA-256 of its raw audio and its transcript spans.
 * The vault stores the pages of this record, so the audio's fingerprint is covered by the hash chain
 * and the anchor; the audio itself is not stored in the vault, and whoever holds it can recompute
 * the SHA-256 and compare. A transcript is a suggestion, and the record says so.
 */
export function buildChatRecordContent(r: TermsResponse): { title: string; text: string; disclaimer: string } {
  const lines = [...r.numbered_chat.split("\n")];
  const voices = r.messages.filter((m) => m.voice !== null);
  if (voices.length > 0) {
    lines.push("", "Voice notes");
    lines.push(
      r.transcriber_mode === "fake"
        ? "Each transcript is a suggestion. In this demo the transcripts are recorded, not speech recognition."
        : "Each transcript is a suggestion and can be wrong."
    );
    for (const m of voices) {
      const v = m.voice!;
      lines.push(`• Message ${m.n}, ${v.name} (${v.size} bytes)`);
      lines.push(`  SHA-256 ${v.sha256}`);
      for (const s of v.segments) lines.push(`  ${rangeLabel(s.start_ms, s.end_ms)}: ${s.text}`);
      if (v.corrected) lines.push("  Transcript corrected by a person.");
    }
    lines.push("", "The audio itself is not stored in the vault. Its SHA-256 above is, so anyone holding the file can check it.");
  }
  return {
    title: "Chat record",
    text: lines.join("\n"),
    disclaimer: "Drafting aid, not legal advice. This record shows the chat as imported; it does not prove the export was genuine.",
  };
}
