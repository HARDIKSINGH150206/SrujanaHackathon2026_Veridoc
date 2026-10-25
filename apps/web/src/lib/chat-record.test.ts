import { describe, expect, it } from "vitest";
import { buildChatRecordContent } from "./chat-record";
import type { TermsResponse } from "./terms";

const SHA = "f607b532439a4d8dcd79c59887b0335656bf043e0945fbae40d02a5350727b73";
function response(over: Partial<TermsResponse> = {}): TermsResponse {
  return {
    playbook_id: "supply-order",
    model_mode: "fake",
    transcriber_mode: "fake",
    demo_mode: true,
    demo_badge: "Demo mode: recorded model output and recorded transcript",
    numbered_chat: "[1] Dev: hi\n[2] Kavi: (voice note) The price is 50 rupees per piece.",
    messages: [
      { n: 1, kind: "message", sender: "Dev", text: "hi", timestamp: null, voice: null },
      {
        n: 2, kind: "voice", sender: "Kavi", text: "The price is 50 rupees per piece.", timestamp: null,
        voice: { name: "PTT-1.wav", sha256: SHA, size: 164204, corrected: false, segments: [{ start_ms: 0, end_ms: 4730, text: "The price is 50 rupees per piece." }] },
      },
    ],
    import_problems: [],
    voice_problems: [],
    report: { terms: [], flags: [], ignored_keys: [], output_problems: [], model_error: null },
    ...over,
  } as TermsResponse;
}

describe("buildChatRecordContent", () => {
  it("starts with the numbered chat", () => {
    const c = buildChatRecordContent(response());
    expect(c.text.startsWith("[1] Dev: hi\n[2] Kavi: (voice note) The price")).toBe(true);
    expect(c.title).toBe("Chat record");
  });

  it("lists each voice note with the SHA-256 of its raw audio, size and spans", () => {
    const c = buildChatRecordContent(response());
    expect(c.text).toContain("Voice notes");
    expect(c.text).toContain("PTT-1.wav");
    expect(c.text).toContain(`SHA-256 ${SHA}`);
    expect(c.text).toContain("164204 bytes");
    expect(c.text).toContain("0:00.0 to 0:04.7");
  });

  it("says the transcript is a suggestion, and that a recorded one is not speech recognition", () => {
    expect(buildChatRecordContent(response()).text).toContain("recorded, not speech recognition");
    const real = buildChatRecordContent(response({ transcriber_mode: "local" }));
    expect(real.text).not.toContain("recorded, not speech recognition");
    expect(real.text).toContain("suggestion");
  });

  it("marks a transcript a person corrected", () => {
    const r = response();
    r.messages[1].voice!.corrected = true;
    expect(buildChatRecordContent(r).text).toContain("corrected by a person");
  });

  it("says the vault holds the fingerprint, not the audio", () => {
    expect(buildChatRecordContent(response()).text).toMatch(/audio itself is not stored in the vault/i);
  });

  it("has no voice section when there is no voice note", () => {
    const r = response({ numbered_chat: "[1] Dev: hi", messages: [response().messages[0]] });
    expect(buildChatRecordContent(r).text).not.toContain("Voice notes");
  });

  it("carries the drafting-aid line and never says tamper-proof", () => {
    const c = buildChatRecordContent(response());
    expect(c.disclaimer).toBe("Drafting aid, not legal advice. This record shows the chat as imported; it does not prove the export was genuine.");
    expect(JSON.stringify(c)).not.toMatch(/tamper-proof/i);
  });
});
