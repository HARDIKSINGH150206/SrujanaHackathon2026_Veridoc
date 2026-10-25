import { describe, expect, it } from "vitest";
import { clearDraft, loadDraft, saveDraft, type RecapDraft, type StorageLike } from "./recap-draft";

function fakeStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}

const DRAFT: RecapDraft = {
  playbook_id: "supply-order",
  demo_badge: "Demo mode: recorded model output",
  senders: ["Dev", "Kavi"],
  terms: [{ key: "quantity", status: "stated", value: "200", quote: ["200 notebooks"], msg: [1], confirmed: true }],
};

describe("recap draft", () => {
  it("round-trips", () => {
    const s = fakeStorage();
    saveDraft(s, DRAFT);
    expect(loadDraft(s)).toEqual(DRAFT);
  });

  it("is null when nothing is stored", () => {
    expect(loadDraft(fakeStorage())).toBeNull();
  });

  it("is null for damaged or hand-edited data instead of throwing", () => {
    const s = fakeStorage();
    for (const bad of ["{nope", "null", "[]", JSON.stringify({ playbook_id: 5 }), JSON.stringify({ ...DRAFT, terms: [{ key: 1 }] }), JSON.stringify({ ...DRAFT, senders: [1] })]) {
      s.setItem("veridoc.recap.draft", bad);
      expect(loadDraft(s), bad).toBeNull();
    }
  });

  it("clears", () => {
    const s = fakeStorage();
    saveDraft(s, DRAFT);
    clearDraft(s);
    expect(loadDraft(s)).toBeNull();
  });

  it("survives storage that throws (private windows)", () => {
    const boom: StorageLike = {
      getItem: () => { throw new Error("blocked"); },
      setItem: () => { throw new Error("blocked"); },
      removeItem: () => { throw new Error("blocked"); },
    };
    expect(() => saveDraft(boom, DRAFT)).not.toThrow();
    expect(loadDraft(boom)).toBeNull();
    expect(() => clearDraft(boom)).not.toThrow();
  });

  it("keeps a null demo badge", () => {
    const s = fakeStorage();
    saveDraft(s, { ...DRAFT, demo_badge: null });
    expect(loadDraft(s)?.demo_badge).toBeNull();
  });
});
