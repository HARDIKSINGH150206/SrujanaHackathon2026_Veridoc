import { readFileSync } from "node:fs";
import path from "node:path";
import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vitest";
import { buildRecapPdf, wrapLine } from "./recap-pdf";

const FONT = new Uint8Array(readFileSync(path.join(__dirname, "../../public/fonts/NotoSans-Latin-Devanagari-subset.ttf")));
const EN = { title: "Summary of what we agreed", text: "Hi Dev, just confirming what we agreed so far:\n• Quantity: 200\n• Price per piece: ₹45\n\nStill to settle:\n• Delivery date: not clear yet.", disclaimer: "Drafting aid, not legal advice." };
const HI = { title: "हमने जो तय किया उसका सार", text: "नमस्ते Dev, अब तक हमने यह तय किया है:\n• कुल राशि: ₹9,000\n• डिलीवरी 20 मार्च 2026 तक", disclaimer: "मसौदा बनाने में सहायता, कानूनी सलाह नहीं।" };

describe("buildRecapPdf", () => {
  it("makes a valid one-page A4 PDF for English text with the rupee sign", async () => {
    const bytes = await buildRecapPdf(EN, FONT);
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(1);
    expect(doc.getPage(0).getSize()).toEqual({ width: 595, height: 842 });
  });

  it("makes a valid PDF for Hindi text", async () => {
    const doc = await PDFDocument.load(await buildRecapPdf(HI, FONT));
    expect(doc.getPageCount()).toBe(1);
  });

  it("embeds the font, so text is real text and not an image", async () => {
    const raw = new TextDecoder("latin1").decode(await buildRecapPdf(EN, FONT));
    expect(raw).toContain("/FontFile2");
    expect(raw).not.toContain("/Subtype /Image");
  });

  it("starts a new page when the text is long", async () => {
    const long = { ...EN, text: Array.from({ length: 120 }, (_, i) => `• Line number ${i + 1}: something that has been agreed`).join("\n") };
    expect((await PDFDocument.load(await buildRecapPdf(long, FONT))).getPageCount()).toBeGreaterThan(1);
  });

  it("is deterministic apart from nothing: the same input gives the same bytes", async () => {
    const a = await buildRecapPdf(EN, FONT);
    const b = await buildRecapPdf(EN, FONT);
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
  });

  it("does not stamp the current time, so a re-build hashes the same", async () => {
    const doc = await PDFDocument.load(await buildRecapPdf(EN, FONT), { updateMetadata: false });
    expect(doc.getCreationDate()?.getTime()).toBe(0);
    expect(doc.getModificationDate()?.getTime()).toBe(0);
  });

  it("refuses text the font cannot draw instead of drawing blanks", async () => {
    await expect(buildRecapPdf({ ...EN, text: "漢字" }, FONT)).rejects.toThrow(/cannot be drawn/);
  });
});

describe("wrapLine", () => {
  const width = (s: string) => s.length * 10;
  it("keeps short lines whole", () => {
    expect(wrapLine("abc def", 100, width)).toEqual(["abc def"]);
  });
  it("wraps at word boundaries", () => {
    expect(wrapLine("aaa bbb ccc", 70, width)).toEqual(["aaa bbb", "ccc"]);
  });
  it("breaks a word that is longer than the line", () => {
    expect(wrapLine("abcdefghij", 50, width)).toEqual(["abcde", "fghij"]);
  });
  it("keeps an empty line as one empty line", () => {
    expect(wrapLine("", 100, width)).toEqual([""]);
  });
});
