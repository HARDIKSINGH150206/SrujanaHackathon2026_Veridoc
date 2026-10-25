import { describe, expect, it } from "vitest";
import { checkReply, echoCode, ECHO_ALPHABET, parseConfirmCode, replyLine } from "./echo-code";

// Reference values computed independently with Python's hashlib (see docs/RECAP_DESIGN.md).
const VECTORS: [string, string][] = [
  ["00".repeat(32), "PGDE3G"],
  ["ff".repeat(32), "J4G6NF"],
  ["8d85b898ba7a182cf07f74b5e11ce742e784081abf5ef395ccdaeb2aa7843e06", "WKKHM0"],
  ["02b4009c6534a3ead816d19109cca02144d7de8f94ed70b3e3fda56825b8bb7c", "ESYPX1"],
];

describe("echoCode", () => {
  it.each(VECTORS)("derives the pinned code for %s", async (hash, code) => {
    expect(await echoCode(hash)).toBe(code);
  });

  it("is six characters from the Crockford alphabet (no I, L, O, U)", async () => {
    expect(ECHO_ALPHABET).toBe("0123456789ABCDEFGHJKMNPQRSTVWXYZ");
    for (const [hash] of VECTORS) expect(await echoCode(hash)).toMatch(/^[0-9A-HJKMNP-TV-Z]{6}$/);
  });

  it("changes when the document hash changes by one character", async () => {
    const a = await echoCode(VECTORS[2][0]);
    const b = await echoCode(VECTORS[2][0].replace(/.$/, "7"));
    expect(a).not.toBe(b);
  });

  it("accepts upper-case hex and refuses anything that is not a 32-byte hex hash", async () => {
    expect(await echoCode(VECTORS[2][0].toUpperCase())).toBe("WKKHM0");
    for (const bad of ["", "abc", "zz".repeat(32), "00".repeat(31), "00".repeat(33)]) {
      await expect(echoCode(bad)).rejects.toThrow(/32-byte/);
    }
  });
});

describe("parseConfirmCode", () => {
  it.each([
    ["CONFIRM 4F7K9X", "4F7K9X"],
    ["confirm 4f7k9x", "4F7K9X"],
    ["Confirm: 4F7K9X thanks!", "4F7K9X"],
    ["ok.\nCONFIRM  4F7-K9X", "4F7K9X"],
    ["CONFIRM 4F7 K9X", "4F7K9X"],
    ["CONFIRM-4F7K9X", "4F7K9X"],
    ["CONFIRM 4F7KOX", "4F7K0X"], // O is read as 0
    ["CONFIRM 4F7KlX", "4F7K1X"], // l and I are read as 1
    ["CONFIRM 4F7KIX", "4F7K1X"],
    ["haan sab theek hai, CONFIRM 4F7K9X", "4F7K9X"],
  ])("reads %j as %s", (reply, code) => {
    expect(parseConfirmCode(reply)).toBe(code);
  });

  it.each([[""], ["ok thanks"], ["CONFIRM"], ["CONFIRM 12"], ["CONFIRM ???"], ["I confirm"], ["confirmed 4F7K9X"]])("finds no code in %j", (reply) => {
    expect(parseConfirmCode(reply)).toBeNull();
  });

  it("uses the first CONFIRM it finds", () => {
    expect(parseConfirmCode("CONFIRM 111111 and later CONFIRM 222222")).toBe("111111");
  });

  it("normalises Unicode before reading", () => {
    expect(parseConfirmCode("ＣＯＮＦＩＲＭ ４Ｆ７Ｋ９Ｘ")).toBe("4F7K9X");
  });
});

describe("checkReply", () => {
  it("matches the exact code", () => {
    expect(checkReply("CONFIRM WKKHM0", "WKKHM0")).toEqual({ result: "match", message: expect.stringContaining("this exact recap") });
  });

  it("matches despite case, spacing and look-alike letters", () => {
    expect(checkReply("confirm wkk-hmO", "WKKHM0").result).toBe("match");
  });

  it("says no code was found", () => {
    expect(checkReply("ok thanks", "WKKHM0").result).toBe("no_code");
  });

  it("says a wrong code does not match and may be for an older recap", () => {
    const r = checkReply("CONFIRM ESYPX1", "WKKHM0");
    expect(r.result).toBe("wrong_code");
    expect(r.message).toMatch(/older recap/);
  });

  it("never claims to know who sent the reply", () => {
    for (const r of [checkReply("CONFIRM WKKHM0", "WKKHM0"), checkReply("x", "WKKHM0"), checkReply("CONFIRM ESYPX1", "WKKHM0")]) {
      expect(r.message).not.toMatch(/verified sender|signed by|authenticated/i);
    }
  });
});

describe("replyLine", () => {
  it("puts the code into the template", () => {
    expect(replyLine("If all correct, reply: CONFIRM {code}", "WKKHM0")).toBe("If all correct, reply: CONFIRM WKKHM0");
  });
  it("inserts the code literally once", () => {
    expect(replyLine("CONFIRM {code} {code}", "$&")).toBe("CONFIRM $& $&");
  });
});
