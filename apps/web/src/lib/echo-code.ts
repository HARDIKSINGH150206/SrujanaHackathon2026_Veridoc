/**
 * Echo code for a recap (docs/RECAP_DESIGN.md). Derived from the stored hash of
 * the recap document (DocumentVersion.clientHash), so a changed recap has a
 * different code. It is a binding check between a reply and one exact recap. It
 * does not show who sent the reply. Not part of any Merkle tree or hash path.
 */

export const ECHO_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford: no I, L, O, U
const DOMAIN = "veridoc/echo/v1";
export const ECHO_CODE_LENGTH = 6;

function hexToBytes(hex: string): Uint8Array {
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) throw new Error("echoCode needs a 32-byte hex hash (64 hex characters).");
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** First 30 bits of SHA-256("veridoc/echo/v1" ‖ 0x00 ‖ hash), as six characters of the alphabet. */
export async function echoCode(documentHashHex: string): Promise<string> {
  const doc = hexToBytes(documentHashHex);
  const prefix = new TextEncoder().encode(DOMAIN);
  const input = new Uint8Array(prefix.length + 1 + doc.length);
  input.set(prefix, 0);
  input[prefix.length] = 0;
  input.set(doc, prefix.length + 1);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", input));
  const bits = ((digest[0] << 24) | (digest[1] << 16) | (digest[2] << 8) | digest[3]) >>> 2; // top 30 bits
  let code = "";
  for (let i = 0; i < ECHO_CODE_LENGTH; i++) code += ECHO_ALPHABET[(bits >>> (5 * (ECHO_CODE_LENGTH - 1 - i))) & 31];
  return code;
}

/** Reads the code after the first CONFIRM in a pasted reply; null if there is none. Spaces and hyphens inside the code are ignored; O reads as 0, I and L as 1. */
export function parseConfirmCode(reply: string): string | null {
  const text = reply.normalize("NFKC").toUpperCase();
  const at = text.indexOf("CONFIRM");
  if (at < 0) return null;
  // "CONFIRMED" is not a code.
  const rest = text.slice(at + "CONFIRM".length);
  if (/^[A-Z]/.test(rest)) return null;
  let code = "";
  for (const ch of rest) {
    if (code.length === 0 && /[\s:\-–—.,]/.test(ch)) continue; // separators before the code
    if (/[\s\-–—]/.test(ch)) continue; // spaces or hyphens inside the code
    const c = ch === "O" ? "0" : ch === "I" || ch === "L" ? "1" : ch;
    if (!ECHO_ALPHABET.includes(c)) break;
    code += c;
    if (code.length === ECHO_CODE_LENGTH) return code;
  }
  return null;
}

export type ReplyCheck = { result: "match" | "no_code" | "wrong_code"; message: string };

export function checkReply(reply: string, expectedCode: string): ReplyCheck {
  const found = parseConfirmCode(reply);
  if (found === null) return { result: "no_code", message: "No \"CONFIRM <code>\" was found in this reply." };
  const expected = expectedCode.toUpperCase().replace(/O/g, "0").replace(/[IL]/g, "1");
  if (found === expected) return { result: "match", message: "The reply carries the code for this exact recap. It does not show who sent it." };
  return { result: "wrong_code", message: "The code does not match this recap. It may be for an older recap." };
}

/** The line added to the WhatsApp message, from the template's {code} placeholder. */
export function replyLine(template: string, code: string): string {
  return template.replace(/\{code\}/g, () => code);
}
