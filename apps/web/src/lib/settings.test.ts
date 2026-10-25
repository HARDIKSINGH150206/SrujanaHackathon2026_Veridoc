import { describe, expect, it } from "vitest";
import { DEFAULT_DEMO_MODE_BADGE, demoBadgeText, settingsFromEnv } from "./settings";

describe("settingsFromEnv", () => {
  it("uses the documented defaults when nothing is set", () => {
    const s = settingsFromEnv({});
    expect(s).toEqual({
      modelMode: "fake",
      transcriberMode: "fake",
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
      TRANSCRIBER_MODE: "local",
      PLAYBOOK_DIR: "/srv/playbooks",
      REDACTION_RULES_FILE: "/srv/rules.json",
      SHARE_LINK_TTL_HOURS: "24",
      DATA_DIR: "/srv/data",
      DEMO_MODE_BADGE: "Custom badge",
    });
    expect(s).toEqual({
      modelMode: "local",
      transcriberMode: "local",
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

  it("rejects an unknown TRANSCRIBER_MODE", () => {
    expect(() => settingsFromEnv({ TRANSCRIBER_MODE: "cloud" })).toThrow(/TRANSCRIBER_MODE/);
  });

  it.each(["0", "-3", "abc", "1.5"])("rejects SHARE_LINK_TTL_HOURS=%s", (v) => {
    expect(() => settingsFromEnv({ SHARE_LINK_TTL_HOURS: v })).toThrow(/SHARE_LINK_TTL_HOURS/);
  });
});

describe("demoBadgeText", () => {
  it("says what is recorded: the model output and the transcript, while both are fake", () => {
    expect(demoBadgeText({})).toBe("Demo mode: recorded model output and recorded transcript");
    expect(demoBadgeText({ MODEL_MODE: "fake", TRANSCRIBER_MODE: "fake" })).toBe("Demo mode: recorded model output and recorded transcript");
  });

  it("names only the part that is recorded", () => {
    expect(demoBadgeText({ TRANSCRIBER_MODE: "local" })).toBe("Demo mode: recorded model output");
    expect(demoBadgeText({ MODEL_MODE: "local" })).toBe("Demo mode: recorded transcript");
  });

  it("uses DEMO_MODE_BADGE as the label but never turns the badge off while anything is fake", () => {
    expect(demoBadgeText({ DEMO_MODE_BADGE: "Recorded output" })).toBe("Recorded output");
    expect(demoBadgeText({ TRANSCRIBER_MODE: "local", DEMO_MODE_BADGE: "Recorded output" })).toBe("Recorded output");
  });

  it("shows no badge when the model and the transcriber are both real", () => {
    expect(demoBadgeText({ MODEL_MODE: "local", TRANSCRIBER_MODE: "local" })).toBeNull();
  });
});
