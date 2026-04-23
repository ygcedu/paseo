import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "os";
import { loadClaudeConfigEnv, mergeClaudeEnv, resolveClaudeModelFromEnv } from "./config-loader.js";

describe("config-loader", () => {
  let tempDir: string;
  let originalClaudeConfigDir: string | undefined;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `paseo-test-${Date.now()}`);
    await mkdir(tempDir, { recursive: true });
    originalClaudeConfigDir = process.env.CLAUDE_CONFIG_DIR;
    process.env.CLAUDE_CONFIG_DIR = tempDir;
  });

  afterEach(async () => {
    if (existsSync(tempDir)) await rm(tempDir, { recursive: true, force: true });
    if (originalClaudeConfigDir !== undefined) {
      process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
    } else {
      delete process.env.CLAUDE_CONFIG_DIR;
    }
  });

  describe("loadClaudeConfigEnv", () => {
    it("returns empty when settings.json missing", async () => {
      expect(await loadClaudeConfigEnv()).toEqual({});
    });

    it("loads env from settings.json", async () => {
      await writeFile(
        path.join(tempDir, "settings.json"),
        JSON.stringify({ env: { ANTHROPIC_API_KEY: "sk-test", ANTHROPIC_AUTH_TOKEN: "tok" } }),
      );
      expect(await loadClaudeConfigEnv()).toEqual({
        ANTHROPIC_API_KEY: "sk-test",
        ANTHROPIC_AUTH_TOKEN: "tok",
      });
    });

    it("handles malformed JSON gracefully", async () => {
      await writeFile(path.join(tempDir, "settings.json"), "{ bad");
      expect(await loadClaudeConfigEnv()).toEqual({});
    });
  });

  describe("mergeClaudeEnv", () => {
    it("prefers process.env over config", () => {
      const result = mergeClaudeEnv(
        { ANTHROPIC_API_KEY: "sk-process", OTHER: "val" },
        { ANTHROPIC_API_KEY: "sk-config", EXTRA: "cfg" },
      );
      expect(result.ANTHROPIC_API_KEY).toBe("sk-process");
      expect(result.EXTRA).toBe("cfg");
    });

    it("uses config when process.env value is undefined", () => {
      const result = mergeClaudeEnv(
        { ANTHROPIC_API_KEY: undefined },
        { ANTHROPIC_API_KEY: "sk-config" },
      );
      expect(result.ANTHROPIC_API_KEY).toBe("sk-config");
    });
  });

  describe("resolveClaudeModelFromEnv", () => {
    it("returns undefined when no model provided", () => {
      expect(resolveClaudeModelFromEnv(undefined, {})).toBeUndefined();
    });

    it("returns original when no override", () => {
      expect(resolveClaudeModelFromEnv("claude-opus-4-6", {})).toBe("claude-opus-4-6");
    });

    it("resolves from ANTHROPIC_DEFAULT_OPUS_MODEL", () => {
      expect(
        resolveClaudeModelFromEnv("claude-opus-4-6", { ANTHROPIC_DEFAULT_OPUS_MODEL: "coding" }),
      ).toBe("coding");
    });

    it("resolves from ANTHROPIC_DEFAULT_SONNET_MODEL", () => {
      expect(
        resolveClaudeModelFromEnv("claude-sonnet-4-6", { ANTHROPIC_DEFAULT_SONNET_MODEL: "fast" }),
      ).toBe("fast");
    });

    it("ignores empty string overrides", () => {
      expect(
        resolveClaudeModelFromEnv("claude-opus-4-6", { ANTHROPIC_DEFAULT_OPUS_MODEL: "  " }),
      ).toBe("claude-opus-4-6");
    });

    it("returns original for non-claude model IDs", () => {
      expect(resolveClaudeModelFromEnv("gpt-4", { ANTHROPIC_DEFAULT_OPUS_MODEL: "coding" })).toBe(
        "gpt-4",
      );
    });
  });
});
