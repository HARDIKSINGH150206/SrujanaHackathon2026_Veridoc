/**
 * Wording of the draft integrity record PDF, the version page and /verify, written once
 * (ADR-022). No imports: client components use it.
 *
 * The record is tamper-evident and nothing more. It is not a legal certificate, and it
 * never claims to satisfy a statute or to be admissible anywhere.
 */

/** Printed on every page of the PDF. */
export const CERTIFICATE_DRAFT_LINE = "Draft integrity record. Not a legal certificate. A lawyer must check it before any legal use.";

/** What the QR proves. */
export const CERTIFICATE_QR_STATEMENT =
  "Scanning the QR code proves this record's commitment is anchored on the public blockchain. " +
  "Verifying a file additionally requires dropping the document pages, with their proof file, into the verify page.";

/** What the record is and is not. */
export const CERTIFICATE_LIMITS =
  "This record lists the hashes of this version and where they were anchored. It is tamper-evident: if a stored page is changed afterwards, " +
  "the check on the public verify page shows a mismatch. It may support, but does not itself satisfy, any legal requirement. " +
  "It does not show that the original chat or document was genuine. Whether and how it can be used in any legal matter is for a lawyer to decide.";
