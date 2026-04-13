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

/**
 * Resolve the default model ID from environment variables.
 * Checks ANTHROPIC_DEFAULT_*_MODEL variables that Claude Code uses.
 *
 * Priority:
 * 1. Explicit model ID passed in
 * 2. ANTHROPIC_DEFAULT_OPUS_MODEL (for opus family)
 * 3. ANTHROPIC_DEFAULT_SONNET_MODEL (for sonnet family)
 * 4. ANTHROPIC_DEFAULT_HAIKU_MODEL (for haiku family)
 *
 * @param requestedModel - The model ID requested (e.g., "claude-opus-4-6")
 * @param env - Environment variables (merged from process.env and config)
 * @returns The resolved model ID, or the original if no override found
 */
export function resolveClaudeModelFromEnv(
  requestedModel: string | undefined,
  env: Record<string, string | undefined>,
): string | undefined {
  if (!requestedModel) {
    return undefined;
  }

  // Extract model family from the requested model ID
  const familyMatch = requestedModel.match(/claude-(opus|sonnet|haiku)/i);
  if (!familyMatch) {
    return requestedModel;
  }

  const family = familyMatch[1]!.toUpperCase();
  const envKey = `ANTHROPIC_DEFAULT_${family}_MODEL`;
  const override = env[envKey];

  if (override && typeof override === "string" && override.trim().length > 0) {
    return override.trim();
  }

  return requestedModel;
}
