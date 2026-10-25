import { describe, expect, it } from "vitest";
import { clockLabel, rangeLabel, reachedEnd } from "./voice-range";

describe("clockLabel", () => {
  it.each([[0, "0:00.0"], [1820, "0:01.8"], [2220, "0:02.2"], [59999, "0:59.9"], [60000, "1:00.0"], [61500, "1:01.5"], [3600000, "60:00.0"]])("%i ms is %s", (ms, label) => {
    expect(clockLabel(ms)).toBe(label);
  });
  it("never goes negative", () => {
    expect(clockLabel(-5)).toBe("0:00.0");
  });
});

describe("rangeLabel", () => {
  it("shows start and end", () => {
    expect(rangeLabel(2220, 4730)).toBe("0:02.2 to 0:04.7");
  });
});

describe("reachedEnd", () => {
  it("is false before the end of the range and true at or after it", () => {
    expect(reachedEnd(4.5, 4730)).toBe(false);
    expect(reachedEnd(4.73, 4730)).toBe(true);
    expect(reachedEnd(5, 4730)).toBe(true);
  });
});
