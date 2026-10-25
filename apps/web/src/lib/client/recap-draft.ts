/**
 * The terms a person confirmed on the Chat terms screen, handed to the Recap
 * screen. Kept in sessionStorage as a per-tab convenience only: nothing here is
 * evidence, and the recap is only evidence once it is uploaded.
 */

import { parseRecapRequest, type RecapTermInput } from "../recap";

export interface RecapDraft {
  playbook_id: string;
  demo_badge: string | null;
  senders: string[];
  terms: RecapTermInput[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const KEY = "veridoc.recap.draft";

export function saveDraft(storage: StorageLike, draft: RecapDraft): void {
  try {
    storage.setItem(KEY, JSON.stringify(draft));
  } catch {
    // Storage can be blocked; the screen then just starts again from Chat terms.
  }
}

export function loadDraft(storage: StorageLike): RecapDraft | null {
  try {
    const raw = storage.getItem(KEY);
    if (raw === null) return null;
    const o: unknown = JSON.parse(raw);
    if (typeof o !== "object" || o === null || Array.isArray(o)) return null;
    const d = o as Record<string, unknown>;
    if (typeof d.playbook_id !== "string") return null;
    if (!(d.demo_badge === null || typeof d.demo_badge === "string")) return null;
    if (!Array.isArray(d.senders) || !d.senders.every((s) => typeof s === "string")) return null;
    const parsed = parseRecapRequest({ playbook_id: d.playbook_id, language: "en", terms: d.terms });
    if (!parsed.ok) return null;
    return { playbook_id: d.playbook_id, demo_badge: d.demo_badge as string | null, senders: d.senders as string[], terms: parsed.value.terms };
  } catch {
    return null;
  }
}

export function clearDraft(storage: StorageLike): void {
  try {
    storage.removeItem(KEY);
  } catch {
    // ignore
  }
}
