import { describe, expect, it } from "vitest";
import { DEFAULT_DEMO_MODE_BADGE, demoBadgeText, settingsFromEnv } from "./settings";

describe("settingsFromEnv", () => {
  it("uses the documented defaults when nothing is set", () => {
    const s = settingsFromEnv({});
    expect(s).toEqual({
      modelMode: "fake",
      playbookDir: "playbooks",
      redactionRulesFile: null,
      shareLinkTtlHours: 72,
      dataDir: "data",
      demoModeBadge: DEFAULT_DEMO_MODE_BADGE,
    });
  });

  it("treats blank values as unset", () => {
    const s = settingsFromEnv({ MODEL_MODE: " ", SHARE_LINK_TTL_HOURS: "", REDACTION_RULES_FILE: "  " });
    expect(s.modelMode).toBe("fake");
    expect(s.shareLinkTtlHours).toBe(72);
    expect(s.redactionRulesFile).toBeNull();
  });

  it("reads every value from the environment", () => {
    const s = settingsFromEnv({
      MODEL_MODE: "local",
      PLAYBOOK_DIR: "/srv/playbooks",
      REDACTION_RULES_FILE: "/srv/rules.json",
      SHARE_LINK_TTL_HOURS: "24",
      DATA_DIR: "/srv/data",
      DEMO_MODE_BADGE: "Custom badge",
    });
    expect(s).toEqual({
      modelMode: "local",
      playbookDir: "/srv/playbooks",
      redactionRulesFile: "/srv/rules.json",
      shareLinkTtlHours: 24,
      dataDir: "/srv/data",
      demoModeBadge: "Custom badge",
    });
  });

  it("rejects an unknown MODEL_MODE instead of silently running fake", () => {
    expect(() => settingsFromEnv({ MODEL_MODE: "remote" })).toThrow(/MODEL_MODE/);
  });

  it.each(["0", "-3", "abc", "1.5"])("rejects SHARE_LINK_TTL_HOURS=%s", (v) => {
    expect(() => settingsFromEnv({ SHARE_LINK_TTL_HOURS: v })).toThrow(/SHARE_LINK_TTL_HOURS/);
  });
});

describe("demoBadgeText", () => {
  it("shows the badge whenever the model is fake", () => {
    expect(demoBadgeText({})).toBe("Demo mode: recorded model output");
    expect(demoBadgeText({ MODEL_MODE: "fake" })).toBe("Demo mode: recorded model output");
  });

  it("uses DEMO_MODE_BADGE as the label but never turns the badge off while fake", () => {
    expect(demoBadgeText({ MODEL_MODE: "fake", DEMO_MODE_BADGE: "Recorded output" })).toBe("Recorded output");
  });

  it("shows no badge for a real model", () => {
    expect(demoBadgeText({ MODEL_MODE: "local" })).toBeNull();
  });
});
