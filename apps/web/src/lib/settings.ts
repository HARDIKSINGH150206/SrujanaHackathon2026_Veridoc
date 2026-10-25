type Env = Record<string, string | undefined>;

/**
 * Typed VeriDoc settings read by the web app. Same pattern as the other
 * *FromEnv helpers (audit-anchor.ts, tile-salts.ts): pure over an env object,
 * so tests pass their own. Model-file settings (MODEL_FILE_PATH, MODEL_SHA256,
 * LLAMA_SERVER_PATH) belong to apps/ai-service and are not read here.
 * Nothing here is a secret.
 */

export type ModelMode = "fake" | "local";
export type TranscriberMode = "fake" | "local";

export interface Settings {
  modelMode: ModelMode;
  transcriberMode: TranscriberMode;
  playbookDir: string;
  redactionRulesFile: string | null;
  shareLinkTtlHours: number;
  dataDir: string;
  demoModeBadge: string;
}

export const DEFAULT_DEMO_MODE_BADGE = "Demo mode: recorded model output";
const DEFAULT_PLAYBOOK_DIR = "playbooks";
const DEFAULT_DATA_DIR = "data";
const DEFAULT_SHARE_LINK_TTL_HOURS = 72;

function read(env: Env, name: string): string | null {
  const raw = env[name]?.trim();
  return raw ? raw : null;
}

export function settingsFromEnv(env: Env = process.env): Settings {
  const mode = read(env, "MODEL_MODE") ?? "fake";
  if (mode !== "fake" && mode !== "local") throw new Error(`MODEL_MODE must be "fake" or "local", got "${mode}".`);

  const transcriber = read(env, "TRANSCRIBER_MODE") ?? "fake";
  if (transcriber !== "fake" && transcriber !== "local") throw new Error(`TRANSCRIBER_MODE must be "fake" or "local", got "${transcriber}".`);

  const ttlRaw = read(env, "SHARE_LINK_TTL_HOURS");
  const ttl = ttlRaw === null ? DEFAULT_SHARE_LINK_TTL_HOURS : Number(ttlRaw);
  if (!Number.isInteger(ttl) || ttl <= 0) throw new Error(`SHARE_LINK_TTL_HOURS must be a whole number > 0, got "${ttlRaw}".`);

  return {
    modelMode: mode,
    transcriberMode: transcriber,
    playbookDir: read(env, "PLAYBOOK_DIR") ?? DEFAULT_PLAYBOOK_DIR,
    redactionRulesFile: read(env, "REDACTION_RULES_FILE"),
    shareLinkTtlHours: ttl,
    dataDir: read(env, "DATA_DIR") ?? DEFAULT_DATA_DIR,
    demoModeBadge: read(env, "DEMO_MODE_BADGE") ?? DEFAULT_DEMO_MODE_BADGE,
  };
}

/**
 * Label for the always-on demo banner, or null when the model and the transcriber are both real.
 * It names what is recorded: the model output, the transcript, or both. DEMO_MODE_BADGE only
 * changes the wording: the badge cannot be switched off while anything is fake, so recorded
 * output is never shown as live.
 */
export function demoBadgeText(env: Env = process.env): string | null {
  const s = settingsFromEnv(env);
  const parts: string[] = [];
  if (s.modelMode === "fake") parts.push("recorded model output");
  if (s.transcriberMode === "fake") parts.push("recorded transcript");
  if (parts.length === 0) return null;
  if (s.demoModeBadge !== DEFAULT_DEMO_MODE_BADGE) return s.demoModeBadge;
  return `Demo mode: ${parts.join(" and ")}`;
}
