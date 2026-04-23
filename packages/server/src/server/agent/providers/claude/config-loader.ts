import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

interface ClaudeSettings {
  env?: Record<string, string>;
  [key: string]: unknown;
}

/** Read environment variables from ~/.claude/settings.json (or CLAUDE_CONFIG_DIR). */
export async function loadClaudeConfigEnv(): Promise<Record<string, string>> {
  const configDir = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");
  const settingsPath = path.join(configDir, "settings.json");

  if (!existsSync(settingsPath)) return {};

  try {
    const content = await readFile(settingsPath, "utf-8");
    return (JSON.parse(content) as ClaudeSettings).env ?? {};
  } catch {
    return {};
  }
}

/** Merge config env with process.env; process.env takes precedence. */
export function mergeClaudeEnv(
  processEnv: Record<string, string | undefined>,
  configEnv: Record<string, string>,
): Record<string, string | undefined> {
  const merged: Record<string, string | undefined> = { ...configEnv };
  for (const [key, value] of Object.entries(processEnv)) {
    if (value !== undefined) merged[key] = value;
  }
  return merged;
}

/** Resolve model alias via ANTHROPIC_DEFAULT_{FAMILY}_MODEL env vars. */
export function resolveClaudeModelFromEnv(
  requestedModel: string | undefined,
  env: Record<string, string | undefined>,
): string | undefined {
  if (!requestedModel) return undefined;

  const familyMatch = requestedModel.match(/claude-(opus|sonnet|haiku)/i);
  if (!familyMatch) return requestedModel;

  const override = env[`ANTHROPIC_DEFAULT_${familyMatch[1]!.toUpperCase()}_MODEL`];
  return override?.trim() || requestedModel;
}
