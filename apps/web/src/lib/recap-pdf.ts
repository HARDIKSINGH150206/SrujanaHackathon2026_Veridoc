import "regenerator-runtime/runtime.js"; // fontkit's Devanagari shaper needs it
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb } from "pdf-lib";

/**
 * The recap as a PDF (docs/RECAP_DESIGN.md). The browser builds it and uploads it
 * through the normal evidence upload, so the hash chain, redaction tiles, audit
 * trail and anchoring cover it. Real text with an embedded font: English, the
 * rupee sign and Hindi all draw. Nothing in it depends on the clock, so building
 * the same recap twice gives the same bytes. The echo code is not in this document.
 */

export interface RecapPdfContent {
  title: string;
  /** Lines separated by \n; a line starting with "• " is a bullet. */
  text: string;
  disclaimer: string;
}

const PAGE_W = 595;
const PAGE_H = 842;
const MARGIN = 56;
const TITLE_SIZE = 18;
const BODY_SIZE = 12;
const SMALL_SIZE = 10;
const LINE_H = 18;
const BULLET = "• ";
const FONT_NAME = "VeriDocNotoSubset";

/** Greedy word wrap; a word wider than the line is broken by characters. */
export function wrapLine(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  if (text === "") return [""];
  const out: string[] = [];
  let current = "";
  const pushWord = (word: string) => {
    const candidate = current === "" ? word : `${current} ${word}`;
    if (measure(candidate) <= maxWidth) {
      current = candidate;
      return;
    }
    if (current !== "") {
      out.push(current);
      current = "";
    }
    if (measure(word) <= maxWidth) {
      current = word;
      return;
    }
    let chunk = "";
    for (const ch of word) {
      if (measure(chunk + ch) > maxWidth && chunk !== "") {
        out.push(chunk);
        chunk = "";
      }
      chunk += ch;
    }
    current = chunk;
  };
  for (const word of text.split(" ")) if (word !== "") pushWord(word);
  if (current !== "") out.push(current);
  return out.length > 0 ? out : [""];
}

export async function buildRecapPdf(content: RecapPdfContent, fontBytes: Uint8Array): Promise<Uint8Array> {
  const doc = await PDFDocument.create({ updateMetadata: false });
  doc.registerFontkit(fontkit);
  // No clock in the file: the same recap always builds to the same bytes.
  doc.setCreationDate(new Date(0));
  doc.setModificationDate(new Date(0));
  doc.setProducer("VeriDoc");
  doc.setCreator("VeriDoc");
  doc.setTitle(content.title);
  const font = await doc.embedFont(fontBytes, { subset: true, customName: FONT_NAME });

  const drawable = font.getCharacterSet();
  for (const str of [content.title, content.text, content.disclaimer]) {
    for (const ch of str) {
      const cp = ch.codePointAt(0)!;
      if (cp !== 10 && cp !== 13 && !drawable.includes(cp)) throw new Error(`The character ${JSON.stringify(ch)} cannot be drawn with the recap font.`);
    }
  }

  const textWidth = PAGE_W - 2 * MARGIN;
  let page = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;
  const ink = rgb(0.1, 0.1, 0.1);
  const grey = rgb(0.4, 0.4, 0.4);
  const need = (h: number) => {
    if (y - h < MARGIN) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  for (const line of wrapLine(content.title, textWidth, (s) => font.widthOfTextAtSize(s, TITLE_SIZE))) {
    need(TITLE_SIZE + 6);
    y -= TITLE_SIZE;
    page.drawText(line, { x: MARGIN, y, size: TITLE_SIZE, font, color: ink });
    y -= 6;
  }
  y -= LINE_H / 2;

  const bulletIndent = font.widthOfTextAtSize(BULLET, BODY_SIZE);
  for (const raw of content.text.split("\n")) {
    const isBullet = raw.startsWith(BULLET);
    const body = isBullet ? raw.slice(BULLET.length) : raw;
    const indent = isBullet ? bulletIndent : 0;
    const wrapped = wrapLine(body, textWidth - indent, (s) => font.widthOfTextAtSize(s, BODY_SIZE));
    wrapped.forEach((piece, i) => {
      need(LINE_H);
      y -= LINE_H;
      if (isBullet && i === 0) page.drawText(BULLET, { x: MARGIN, y, size: BODY_SIZE, font, color: ink });
      if (piece !== "") page.drawText(piece, { x: MARGIN + indent, y, size: BODY_SIZE, font, color: ink });
    });
  }

  need(LINE_H * 2);
  y -= LINE_H;
  for (const line of wrapLine(content.disclaimer, textWidth, (s) => font.widthOfTextAtSize(s, SMALL_SIZE))) {
    y -= SMALL_SIZE + 4;
    page.drawText(line, { x: MARGIN, y, size: SMALL_SIZE, font, color: grey });
  }

  return doc.save({ useObjectStreams: false });
}
