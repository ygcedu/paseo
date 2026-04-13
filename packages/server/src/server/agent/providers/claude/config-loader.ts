import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "node:os";

interface ClaudeSettings {
  env?: Record<string, string>;
  [key: string]: unknown;
}

/**
 * Load environment variables from Claude Code's settings.json file.
 * This allows Paseo to inherit API keys and other config when they're not
 * set in the process environment.
 */
export async function loadClaudeConfigEnv(): Promise<Record<string, string>> {
  const configDir = process.env.CLAUDE_CONFIG_DIR ?? path.join(os.homedir(), ".claude");
  const settingsPath = path.join(configDir, "settings.json");

  if (!existsSync(settingsPath)) {
    return {};
  }

  try {
    const content = await readFile(settingsPath, "utf-8");
    const settings = JSON.parse(content) as ClaudeSettings;
    return settings.env ?? {};
  } catch (error) {
    // Silently ignore parse errors - don't break if settings.json is malformed
    return {};
  }
}

/**
 * Merge environment variables with Claude config, preferring process.env.
 * This ensures that explicit environment variables take precedence over
 * config file values.
 */
export function mergeClaudeEnv(
  processEnv: Record<string, string | undefined>,
  configEnv: Record<string, string>,
): Record<string, string | undefined> {
  const merged: Record<string, string | undefined> = { ...configEnv };

  // Process env takes precedence
  for (const [key, value] of Object.entries(processEnv)) {
    if (value !== undefined) {
      merged[key] = value;
    }
  }

  return merged;
}
