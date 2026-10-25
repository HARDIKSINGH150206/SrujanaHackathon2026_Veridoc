// Demo seed for VeriDoc: five named accounts, two synthetic agreements (a supply
// order and a freelance job) and three documents, all taken from the synthetic
// samples in samples/veridoc/ (a chat export for each agreement and the order
// confirmation).
//
// Documents go through the real pipeline, not straight into the database:
// each page is rendered as a lossless PNG, hashed exactly like the browser
// does (proof format v2: 20x20 tiles, raw RGBA pixels, random per-tile
// salts, RFC 6962 trees, commitment C — via the independent reference in
// packages/crypto-core/reference/dv2-ref.mjs) and uploaded to
// POST /api/v1/evidence/upload. So every document has real page images in
// MinIO, real tile hashes, a real hash chain, AI redaction suggestions (if
// apps/ai-service is running) and a real Polygon Amoy anchor (if the
// deployer wallet has funds; otherwise the anchor shows FAILED and can be
// retried from the UI). Nothing on screen is fabricated.
//
// All people, shops and amounts in the documents are made up; every page
// carries a "synthetic demonstration record" footer.
//
// Safe to re-run: users are upserted by sign-in ID, agreements by agreement
// number, and documents already present in a case (by title) are skipped —
// except that a document whose current version is still proof format v1 gets
// the same pages again as a new v2 version (salted, anchored on contract v2).
//
// Prereqs: DB migrated, web app running (DEMO_BASE_URL, default
// http://localhost:3000). Schema lives in the repo-root prisma/ directory.
// Run from apps/web:
//   node --experimental-strip-types prisma/seed-demo.ts

import { readFileSync } from "node:fs";
import bcrypt from "bcryptjs";
import sharp from "sharp";
import { PrismaClient, type Role } from "@prisma/client";
// @ts-expect-error — untyped .mjs reference implementation
import { computeDocument, randomSalts } from "../../../packages/crypto-core/reference/dv2-ref.mjs";

const prisma = new PrismaClient();
const BASE = process.env.DEMO_BASE_URL ?? "http://localhost:3000";
const GRID_SIZE = 20;
const PAGE_W = 1240; // A4 at 150 dpi (height rounded to a multiple of 20)
const PAGE_H = 1760;
const BCRYPT_ROUNDS = 10;
const DEPARTMENT = "General";
const SAMPLES = new URL("../../../samples/veridoc/", import.meta.url);

// --- Accounts ----------------------------------------------------------------

interface DemoUser {
  key: string;
  name: string;
  serviceNumber: string;
  role: Role;
  pin: string;
  authIdentity: string;
}

const USERS: DemoUser[] = [
  { key: "asha", name: "Asha (admin)", serviceNumber: "ADMIN-ASHA", role: "ADMIN", pin: "112233", authIdentity: "asha@demo.veridoc" },
  { key: "dev", name: "Dev (party)", serviceNumber: "PARTY-DEV", role: "INVESTIGATING_OFFICER", pin: "224466", authIdentity: "dev@demo.veridoc" },
  { key: "ira", name: "Ira (party)", serviceNumber: "PARTY-IRA", role: "INVESTIGATING_OFFICER", pin: "335577", authIdentity: "ira@demo.veridoc" },
  { key: "reviewer", name: "Reviewer", serviceNumber: "REVIEWER-1", role: "COURT_OFFICIAL", pin: "446688", authIdentity: "reviewer@demo.veridoc" },
  { key: "verifier", name: "Verifier", serviceNumber: "VERIFIER-1", role: "FORENSIC_LAB", pin: "557799", authIdentity: "verifier@demo.veridoc" },
];

// --- Cases and documents ----------------------------------------------------------

interface DemoDocument {
  title: string;
  docType: string;
  pages: string[][]; // lines per page; "# " = heading, "## " = subheading, "---" = rule
}

interface DemoCase {
  caseNumber: string;
  caseType: string;
  // The UI treats "OPEN" as the active state (dashboard counts and badges).
  status: "OPEN" | "UNDER_REVIEW" | "CLOSED";
  department: string;
  owner: "dev" | "ira";
  documents: DemoDocument[];
}

/** The chat sample as one page: a heading, then each message, wrapped to fit the page. */
function chatPage(file: string): string[][] {
  const lines = readFileSync(new URL(`chats/${file}`, SAMPLES), "utf-8").split("\n").filter((l) => l.trim() !== "");
  const out = ["# CHAT EXPORT", "## Synthetic sample, not a real chat", "---"];
  for (const line of lines) {
    const words = line.split(" ");
    let row = "";
    for (const w of words) {
      if ((row + " " + w).trim().length > 86) {
        out.push(row);
        row = "    " + w;
      } else row = (row + " " + w).trim();
    }
    out.push(row);
  }
  return [out];
}

const CASES: DemoCase[] = [
  {
    caseNumber: "AGR/2026/0001",
    caseType: "Supply order",
    status: "OPEN",
    department: DEPARTMENT,
    owner: "dev",
    documents: [
      {
        title: "Chat export - supply order.pdf",
        docType: "Chat export",
        pages: chatPage("supply-order.txt"),
      },
      {
        title: "Order confirmation.pdf",
        docType: "Order confirmation",
        pages: [
          [
            "# ORDER CONFIRMATION",
            "## Synthetic sample, not a real order",
            "---",
            "Supplier: Lumo Stationers (fictional)",
            "Buyer: Dev",
            "Date: 12 March 2026",
            "---",
            "Item: A5 ruled notebook, school logo on cover",
            "Quantity: 200",
            "Price per piece: Rs 45",
            "Total: Rs 9000",
            "Advance received: Rs 3000",
            "Balance on delivery: Rs 6000",
            "Delivery by: 20 March 2026",
          ],
        ],
      },
    ],
  },
  {
    caseNumber: "AGR/2026/0002",
    caseType: "Freelance job",
    status: "OPEN",
    department: DEPARTMENT,
    owner: "ira",
    documents: [
      {
        title: "Chat export - freelance job.pdf",
        docType: "Chat export",
        pages: chatPage("freelance-job.txt"),
      },
    ],
  },
];

// --- Page rendering and hashing (mirrors apps/web/src/lib/server-hash.ts) ----------

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function renderPage(lines: string[], caseNumber: string, pageNo: number, pageCount: number): Promise<Buffer> {
  const parts: string[] = [];
  let y = 120;
  for (const line of lines) {
    if (line === "---") {
      parts.push(`<line x1="90" y1="${y - 14}" x2="${PAGE_W - 90}" y2="${y - 14}" stroke="#555" stroke-width="1"/>`);
      y += 14;
    } else if (line.startsWith("# ")) {
      parts.push(`<text x="${PAGE_W / 2}" y="${y}" text-anchor="middle" font-family="DejaVu Serif" font-size="30" font-weight="bold">${escapeXml(line.slice(2))}</text>`);
      y += 44;
    } else if (line.startsWith("## ")) {
      parts.push(`<text x="${PAGE_W / 2}" y="${y}" text-anchor="middle" font-family="DejaVu Serif" font-size="21" font-style="italic">${escapeXml(line.slice(3))}</text>`);
      y += 40;
    } else {
      parts.push(`<text x="90" y="${y}" font-family="DejaVu Sans" font-size="20" xml:space="preserve">${escapeXml(line)}</text>`);
      y += 34;
    }
  }
  const footer =
    `Page ${pageNo} of ${pageCount}  |  ${caseNumber}  |  ` +
    "SYNTHETIC DEMONSTRATION RECORD - all persons and events are fictional";
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE_W}" height="${PAGE_H}">` +
    `<rect width="100%" height="100%" fill="#fdfdfb"/>` +
    `<g fill="#111">${parts.join("")}</g>` +
    `<text x="${PAGE_W / 2}" y="${PAGE_H - 50}" text-anchor="middle" font-family="DejaVu Sans" font-size="15" fill="#777">${escapeXml(footer)}</text>` +
    `</svg>`;
  // Lossless PNG only (CLAUDE.md rule 1).
  return sharp(Buffer.from(svg)).png().toBuffer();
}

interface TileMeta {
  tile_index: number;
  page_index: number;
  row: number;
  col: number;
  hash: string;
}

async function decodePage(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { rgba: data, width: info.width, height: info.height };
}

// --- API helpers ----------------------------------------------------------------------

async function api<T>(path: string, token: string | null, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (init.body && typeof init.body === "string") headers.set("Content-Type", "application/json");
  const res = await fetch(`${BASE}${path}`, { ...init, headers });
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status} ${JSON.stringify(body)}`);
  return body as T;
}

async function login(user: DemoUser): Promise<string> {
  const body = await api<{ token: string }>("/api/auth/login", null, {
    method: "POST",
    body: JSON.stringify({ serviceNumber: user.serviceNumber, pin: user.pin }),
  });
  return body.token;
}

/** Uploads `doc` as a new document, or, with `documentId`, as the next version of that document. */
async function uploadDocument(token: string, caseId: string, caseNumber: string, doc: DemoDocument, documentId: string | null = null) {
  const pngs: Buffer[] = [];
  for (let i = 0; i < doc.pages.length; i++) pngs.push(await renderPage(doc.pages[i], caseNumber, i + 1, doc.pages.length));
  const decoded = [];
  for (const png of pngs) decoded.push(await decodePage(png));
  const salts: Buffer[] = randomSalts(pngs.length * GRID_SIZE * GRID_SIZE);
  const hashed: { fileHash: string; documentRoot: string; commitment: string; tiles: TileMeta[] } = computeDocument(
    decoded,
    pngs,
    GRID_SIZE,
    salts
  );

  const metadata = {
    case_id: caseId,
    document_id: documentId,
    title: doc.title,
    doc_type: doc.docType,
    source_type: "NATIVE_PDF",
    proof_version: 2,
    grid_size: GRID_SIZE,
    page_count: pngs.length,
    client_hash: hashed.fileHash,
    merkle_root: hashed.documentRoot,
    commitment: hashed.commitment,
    salts: salts.map((b) => b.toString("hex")),
    tiles: hashed.tiles,
    pages: pngs.map((_, i) => ({ page_index: i, width_px: PAGE_W, height_px: PAGE_H })),
  };
  const form = new FormData();
  form.set("metadata", JSON.stringify(metadata));
  pngs.forEach((png, i) => form.set(`page_${i}`, new Blob([new Uint8Array(png)], { type: "image/png" }), `page-${i}.png`));
  return api<{ document_id: string; document_version_id: string }>("/api/v1/evidence/upload", token, {
    method: "POST",
    body: form,
  });
}

// --- Seed -----------------------------------------------------------------------------

async function seedUsers(): Promise<Record<string, { id: string; user: DemoUser }>> {
  const out: Record<string, { id: string; user: DemoUser }> = {};
  for (const u of USERS) {
    const pinHash = await bcrypt.hash(u.pin, BCRYPT_ROUNDS);
    const row = await prisma.user.upsert({
      where: { serviceNumber: u.serviceNumber },
      update: { role: u.role, pinHash, authIdentity: u.authIdentity, department: DEPARTMENT },
      create: { role: u.role, pinHash, authIdentity: u.authIdentity, department: DEPARTMENT, serviceNumber: u.serviceNumber },
    });
    out[u.key] = { id: row.id, user: u };
    console.log(`user  ${u.serviceNumber.padEnd(14)} ${u.role.padEnd(22)} ${u.name}`);
  }
  return out;
}

async function waitForAnchors(token: string, versions: { documentId: string; versionId: string }[], timeoutMs = 180000) {
  const deadline = Date.now() + timeoutMs;
  const settled = new Map<string, string>();
  while (settled.size < versions.length && Date.now() < deadline) {
    for (const v of versions) {
      if (settled.has(v.versionId)) continue;
      const info = await api<{ anchor: { status: string } | null }>(
        `/api/v1/documents/${v.documentId}/versions/${v.versionId}`,
        token
      );
      if (info.anchor && info.anchor.status !== "PENDING") settled.set(v.versionId, info.anchor.status);
    }
    if (settled.size < versions.length) await new Promise((r) => setTimeout(r, 3000));
  }
  return settled;
}

async function main() {
  try {
    await fetch(`${BASE}/login`);
  } catch {
    throw new Error(`Web app not reachable at ${BASE}. Start it first (pnpm --filter @digivault/web dev).`);
  }

  const users = await seedUsers();
  const tokens: Record<string, string> = {};
  for (const key of ["dev", "ira", "reviewer"]) tokens[key] = await login(users[key].user);

  const reviewedVersions: { documentId: string; versionId: string }[] = [];
  const newVersions: { documentId: string; versionId: string }[] = [];

  for (const c of CASES) {
    const ownerId = users[c.owner].id;
    let kase = await prisma.case.findUnique({ where: { caseNumber: c.caseNumber } });
    if (!kase) {
      // Through the API so the case gets its CREATE_CASE audit entry.
      await api("/api/v1/cases", tokens[c.owner], {
        method: "POST",
        body: JSON.stringify({ case_number: c.caseNumber, case_type: c.caseType, department: c.department, status: c.status }),
      });
      kase = await prisma.case.findUniqueOrThrow({ where: { caseNumber: c.caseNumber } });
    }
    kase = await prisma.case.update({
      where: { id: kase.id },
      data: { caseType: c.caseType, status: c.status, department: c.department, createdById: ownerId },
    });
    console.log(`case  ${c.caseNumber} ${c.caseType} ${c.status}`);

    for (const doc of c.documents) {
      const existing = await prisma.document.findFirst({
        where: { caseId: kase.id, title: doc.title, currentVersionId: { not: null } },
      });
      let ref: { documentId: string; versionId: string };
      const current = existing
        ? await prisma.documentVersion.findUniqueOrThrow({ where: { id: existing.currentVersionId! } })
        : null;
      if (existing && current && current.proofVersion < 2) {
        // Seeded before proof format v2 / contract v2 (docs/07 Phase 8): the
        // same pages again as the next version, salted and anchored on v2.
        // The legacy version stays as version 1 of the document's chain.
        const res = await uploadDocument(tokens[c.owner], kase.id, c.caseNumber, doc, existing.id);
        ref = { documentId: res.document_id, versionId: res.document_version_id };
        newVersions.push(ref);
        console.log(`  doc v2 added ${doc.title} (was proof v${current.proofVersion})`);
      } else if (existing) {
        ref = { documentId: existing.id, versionId: existing.currentVersionId! };
        console.log(`  doc exists   ${doc.title}`);
      } else {
        const res = await uploadDocument(tokens[c.owner], kase.id, c.caseNumber, doc);
        ref = { documentId: res.document_id, versionId: res.document_version_id };
        newVersions.push(ref);
        console.log(`  doc uploaded ${doc.title}`);
      }
      if (c.status !== "OPEN") reviewedVersions.push(ref);
    }
  }

  // The reviewer opens the closed and under-review documents, through
  // the real page route so the views are audited as VIEW_DOCUMENT_VERSION.
  const reviewerId = users.reviewer.id;
  for (const v of reviewedVersions) {
    const viewed = await prisma.auditLog.findFirst({
      where: { actorId: reviewerId, action: "VIEW_DOCUMENT_VERSION", targetId: v.versionId },
    });
    if (viewed) continue;
    const res = await fetch(`${BASE}/api/v1/documents/${v.documentId}/versions/${v.versionId}/pages/0`, {
      headers: { Authorization: `Bearer ${tokens.reviewer}` },
    });
    if (!res.ok) throw new Error(`Reviewer page view failed: ${res.status}`);
    await res.arrayBuffer();
  }

  if (newVersions.length > 0) {
    console.log(`waiting for ${newVersions.length} background anchor(s)...`);
    const settled = await waitForAnchors(tokens.dev, newVersions);
    const counts: Record<string, number> = {};
    for (const v of newVersions) {
      const s = settled.get(v.versionId) ?? "PENDING";
      counts[s] = (counts[s] ?? 0) + 1;
    }
    console.log("anchors:", counts);
    if (counts.FAILED) {
      console.log("Some anchors failed (e.g. deployer wallet out of gas or RPC unreachable).");
      console.log("Fix the cause, then use 'Retry anchoring' on each version page.");
    }
  }
  console.log("demo seed complete");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
