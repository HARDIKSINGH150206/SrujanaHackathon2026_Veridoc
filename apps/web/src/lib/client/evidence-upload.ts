import "@/lib/client/buffer-polyfill";
import "@/lib/client/pdf-worker-setup";
import { hashDocumentV2, DEFAULT_GRID_SIZE, DV2_PROOF_VERSION } from "@digivault/crypto-core";
import { apiFetch } from "./api-client";

/**
 * The normal evidence upload for a PDF made in the browser (same steps as the Upload
 * screen, apps/web/src/app/dashboard/_workspace/upload-view.tsx): hash every page in
 * the browser, POST /api/v1/evidence/upload, and let the server recompute. Used by
 * the Recap screen so the recap is covered by the same hash chain, redaction tiles,
 * audit trail and anchoring as any other document (docs/RECAP_DESIGN.md).
 */

export interface UploadedVersion {
  document_id: string;
  document_version_id: string;
  /** SHA-256 over the page images, recomputed and stored by the server. */
  client_hash: string;
  merkle_root: string;
  commitment: string;
}

export async function uploadPdfAsEvidence(
  pdf: Uint8Array,
  opts: { caseId: string; title: string; docType: string; documentId?: string | null },
  onPhase?: (phase: "hashing" | "uploading") => void
): Promise<UploadedVersion> {
  onPhase?.("hashing");
  const bytes = pdf.slice().buffer as ArrayBuffer;
  const result = await hashDocumentV2(bytes, { gridSize: DEFAULT_GRID_SIZE });

  onPhase?.("uploading");
  const metadata = {
    case_id: opts.caseId,
    document_id: opts.documentId ?? null,
    title: opts.title,
    doc_type: opts.docType,
    source_type: "NATIVE_PDF",
    proof_version: DV2_PROOF_VERSION,
    grid_size: result.gridSize,
    page_count: result.pageCount,
    client_hash: result.fileHash,
    merkle_root: result.documentRoot,
    commitment: result.commitment,
    salts: result.salts,
    tiles: result.tiles.map((t) => ({ tile_index: t.index, page_index: t.pageIndex, row: t.row, col: t.col, hash: t.hashHex })),
    pages: result.pages.map((p) => ({ page_index: p.pageIndex, width_px: p.widthPx, height_px: p.heightPx })),
  };
  const form = new FormData();
  form.set("metadata", JSON.stringify(metadata));
  result.pagePngBytes.forEach((b, i) => {
    form.set(`page_${i}`, new Blob([b.slice().buffer], { type: "image/png" }), `page-${i}.png`);
  });
  const res = await apiFetch("/api/v1/evidence/upload", { method: "POST", body: form });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message ?? `Upload failed (${res.status})`);
  return body as UploadedVersion;
}
