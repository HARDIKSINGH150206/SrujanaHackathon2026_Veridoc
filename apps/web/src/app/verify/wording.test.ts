import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// The public /verify page speaks VeriDoc: no DigiVault brand, no NCRB, police or court wording, and
// "tamper-evident", never "tamper-proof". Identifiers (digivault_proof_version, @digivault/...) are not wording.
const DIR = __dirname;
const FILES = readdirSync(DIR).filter((f) => /\.(ts|tsx)$/.test(f) && !f.endsWith(".test.ts"));

describe("verify page wording", () => {
  it("has source files to check", () => {
    expect(FILES).toContain("page.tsx");
  });

  it.each(FILES)("%s uses no old brand or domain wording", (file) => {
    const text = readFileSync(path.join(DIR, file), "utf-8");
    expect(text).not.toMatch(/DigiVault/); // the brand; lower-case identifiers such as digivault_proof_version stay
    expect(text).not.toMatch(/\bNCRB\b|\b[Pp]olice\b|\b[Cc]ourts?\b|\b[Oo]fficers?\b|Women Safety/);
  });

  it.each(FILES)("%s never says tamper-proof", (file) => {
    expect(readFileSync(path.join(DIR, file), "utf-8")).not.toMatch(/tamper[- ]?proof/i);
  });

  it("says what the trust messages mean, in VeriDoc words", () => {
    const page = readFileSync(path.join(DIR, "page.tsx"), "utf-8");
    expect(page).toContain("Verified agreement record");
    expect(page).toContain("Mismatch");
    expect(page).toMatch(/tamper-evident/);
  });

  it("keeps the tile-level mismatch result", () => {
    const page = readFileSync(path.join(DIR, "page.tsx"), "utf-8");
    expect(page).toMatch(/mismatch/);
    expect(readFileSync(path.join(DIR, "proof-v2.ts"), "utf-8")).toMatch(/tile/i);
  });
});
