import { describe, expect, it } from "vitest";
import jsQR from "jsqr";
import { buildCertificatePdf, type CertificateInput } from "./certificate";
import { CERTIFICATE_DRAFT_LINE, CERTIFICATE_LIMITS, CERTIFICATE_QR_STATEMENT } from "./certificate-text";

// pdfjs in Node: text and embedded images straight from the PDF bytes.
async function openPdf(bytes: Uint8Array) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: bytes.slice(), useSystemFonts: false, isEvalSupported: false, verbosity: 0 }).promise;
  const texts: string[] = [];
  for (let n = 1; n <= doc.numPages; n++) {
    texts.push((await (await doc.getPage(n)).getTextContent()).items.map((i) => ("str" in i ? i.str : "")).join("\n"));
  }
  const page = await doc.getPage(1);
  const text = texts[0];
  const ops = await page.getOperatorList();
  const images: { width: number; height: number; rgba: Uint8ClampedArray }[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    if (ops.fnArray[i] !== pdfjs.OPS.paintImageXObject) continue;
    const img = await new Promise<{ width: number; height: number; data: Uint8Array; kind: number }>((resolve) =>
      page.objs.get(ops.argsArray[i][0], resolve)
    );
    // kind 2 = RGB_24BPP, 3 = RGBA_32BPP, 1 = GRAYSCALE_1BPP.
    const rgba = new Uint8ClampedArray(img.width * img.height * 4);
    for (let p = 0; p < img.width * img.height; p++) {
      if (img.kind === 3) rgba.set(img.data.subarray(p * 4, p * 4 + 4), p * 4);
      else if (img.kind === 2) rgba.set([img.data[p * 3], img.data[p * 3 + 1], img.data[p * 3 + 2], 255], p * 4);
      else {
        const bit = (img.data[Math.floor(p / img.width) * Math.ceil(img.width / 8) + ((p % img.width) >> 3)] >> (7 - ((p % img.width) & 7))) & 1;
        rgba.set([bit * 255, bit * 255, bit * 255, 255], p * 4);
      }
    }
    images.push({ width: img.width, height: img.height, rgba });
  }
  return { pages: doc.numPages, text, texts, images };
}

const H = (c: string) => c.repeat(64);
const URL_ = `https://verify.example/verify?v=cm0version&c=${H("c")}&tx=0x${H("7")}`;

function input(overrides: Partial<CertificateInput> = {}): CertificateInput {
  return {
    caseNumber: "CASE-2026-0042",
    documentTitle: "FIR statement",
    versionNo: 2,
    proofVersion: 2,
    gridSize: 20,
    anchoredValue: H("c"),
    documentRoot: H("d"),
    fileHash: H("f"),
    chainHash: H("e"),
    previousHash: H("b"),
    anchor: {
      txHash: `0x${H("7")}`,
      contractAddress: "0x01e7e6f83f55873E906465d3447cB43434D4ee67",
      objectLockUri: "minio://digivault-anchors/doc/v2/merkle-root.json",
      block: { number: 50562527, time: new Date("2026-10-19T10:00:00Z") },
      recordedAt: new Date("2026-10-19T10:00:05Z"),
    },
    verifyUrl: URL_,
    generatedAt: new Date("2026-10-19T12:00:00Z"),
    generatedForRole: "INVESTIGATING_OFFICER",
    ...overrides,
  };
}

describe("buildCertificatePdf: draft, not a legal certificate", () => {
  const squash = (s: string) => s.replace(/\s+/g, " ");

  it("prints the draft line on every page", async () => {
    const { pages, texts } = await openPdf(await buildCertificatePdf(input()));
    expect(CERTIFICATE_DRAFT_LINE).toBe("Draft integrity record. Not a legal certificate. A lawyer must check it before any legal use.");
    expect(texts).toHaveLength(pages);
    for (const t of texts) expect(squash(t)).toContain(CERTIFICATE_DRAFT_LINE);
  });

  it("prints it on the not-yet-anchored version too", async () => {
    const { texts } = await openPdf(await buildCertificatePdf(input({ anchor: null, verifyUrl: null })));
    for (const t of texts) expect(squash(t)).toContain(CERTIFICATE_DRAFT_LINE);
  });

  it("says the record is tamper-evident and may support, but does not itself satisfy, any legal requirement", async () => {
    const { text } = await openPdf(await buildCertificatePdf(input()));
    const flat = squash(text);
    expect(flat).toContain(squash(CERTIFICATE_LIMITS));
    expect(flat).toContain("tamper-evident");
    expect(flat).toContain("does not itself satisfy, any legal requirement");
  });

  it("makes no statutory or admissibility claim and never says tamper-proof", async () => {
    const { text } = await openPdf(await buildCertificatePdf(input()));
    expect(text).not.toMatch(/Sakshya|Section 63|s\.63|BSA|admissib|tamper-?proof|valid until|legal effect/i);
  });

  it("is titled as a draft in the PDF metadata", async () => {
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: (await buildCertificatePdf(input())).slice(), isEvalSupported: false, verbosity: 0 }).promise;
    const meta = (await doc.getMetadata()).info as { Title?: string };
    expect(meta.Title).toBe("Draft integrity record: CASE-2026-0042 v2");
  });
});

describe("buildCertificatePdf", () => {
  it("is one page with every field docs/07 Phase 5 lists, and the QR decodes to the verify URL", async () => {
    const { pages, text, images } = await openPdf(await buildCertificatePdf(input()));
    expect(pages).toBe(1);
    const flat = text.replace(/\n/g, " ");
    for (const s of ["CASE-2026-0042", "FIR statement", H("c"), H("f"), `0x${H("7")}`, "50562527, 2026-10-19T10:00:00.000Z", "0x01e7e6f83f55873E906465d3447cB43434D4ee67"]) {
      expect(flat).toContain(s);
    }
    expect(text).toContain("Reviewed by");
    expect(text).toContain("Checked by a lawyer (before any legal use)");
    expect(flat.replace(/\s+/g, " ")).toContain(CERTIFICATE_QR_STATEMENT);

    expect(images).toHaveLength(1);
    const qr = jsQR(images[0].rgba, images[0].width, images[0].height);
    expect(qr?.data).toBe(URL_);
  });

  it("draws no QR before the version is anchored, and says why", async () => {
    const { text, images } = await openPdf(await buildCertificatePdf(input({ anchor: null, verifyUrl: null })));
    expect(images).toHaveLength(0);
    expect(text.replace(/\n/g, " ")).toContain("not anchored yet");
    expect(text).not.toContain(CERTIFICATE_QR_STATEMENT.slice(0, 30));
  });

  it("falls back to the recorded time when the block could not be read", async () => {
    const base = input();
    const { text } = await openPdf(await buildCertificatePdf(input({ anchor: { ...base.anchor!, block: null } })));
    expect(text.replace(/\n/g, " ")).toContain("not read from the chain; recorded 2026-10-19T10:00:05.000Z");
  });

  it("labels a legacy v1 version's anchored value as its Merkle root", async () => {
    const { text } = await openPdf(await buildCertificatePdf(input({ proofVersion: 1 })));
    expect(text).toContain("Merkle root (SHA-256)");
    expect(text).not.toContain("Document root");
  });

  it("does not fail on a title the standard PDF fonts cannot encode", async () => {
    const { text } = await openPdf(await buildCertificatePdf(input({ documentTitle: "प्राथमिकी FIR — 12" })));
    expect(text).toContain("FIR");
  });
});
