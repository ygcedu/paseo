import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import os from "os";
import { loadClaudeConfigEnv, mergeClaudeEnv } from "./config-loader.js";

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
    if (existsSync(tempDir)) {
      await rm(tempDir, { recursive: true, force: true });
    }
    if (originalClaudeConfigDir !== undefined) {
      process.env.CLAUDE_CONFIG_DIR = originalClaudeConfigDir;
    } else {
      delete process.env.CLAUDE_CONFIG_DIR;
    }
  });

  describe("loadClaudeConfigEnv", () => {
    it("should return empty object when settings.json does not exist", async () => {
      const result = await loadClaudeConfigEnv();
      expect(result).toEqual({});
    });

    it("should load env from settings.json", async () => {
      const settingsPath = path.join(tempDir, "settings.json");
      await writeFile(
        settingsPath,
        JSON.stringify({
          env: {
            ANTHROPIC_API_KEY: "sk-test-key",
            ANTHROPIC_BASE_URL: "https://api.example.com",
          },
        }),
      );

      const result = await loadClaudeConfigEnv();
      expect(result).toEqual({
        ANTHROPIC_API_KEY: "sk-test-key",
        ANTHROPIC_BASE_URL: "https://api.example.com",
      });
    });

    it("should return empty object when env field is missing", async () => {
      const settingsPath = path.join(tempDir, "settings.json");
      await writeFile(
        settingsPath,
        JSON.stringify({
          permissions: { allow: [] },
        }),
      );

      const result = await loadClaudeConfigEnv();
      expect(result).toEqual({});
    });

    it("should handle malformed JSON gracefully", async () => {
      const settingsPath = path.join(tempDir, "settings.json");
      await writeFile(settingsPath, "{ invalid json }");

      const result = await loadClaudeConfigEnv();
      expect(result).toEqual({});
    });

    it("should handle ANTHROPIC_AUTH_TOKEN from settings", async () => {
      const settingsPath = path.join(tempDir, "settings.json");
      await writeFile(
        settingsPath,
        JSON.stringify({
          env: {
            ANTHROPIC_AUTH_TOKEN: "sk-auth-token",
            ANTHROPIC_BASE_URL: "http://localhost:20128/v1",
          },
        }),
      );

      const result = await loadClaudeConfigEnv();
      expect(result).toEqual({
        ANTHROPIC_AUTH_TOKEN: "sk-auth-token",
        ANTHROPIC_BASE_URL: "http://localhost:20128/v1",
      });
    });
  });

  describe("mergeClaudeEnv", () => {
    it("should prefer process.env over config env", () => {
      const processEnv = {
        ANTHROPIC_API_KEY: "sk-process-key",
        OTHER_VAR: "process-value",
      };
      const configEnv = {
        ANTHROPIC_API_KEY: "sk-config-key",
        ANTHROPIC_BASE_URL: "https://config.example.com",
      };

      const result = mergeClaudeEnv(processEnv, configEnv);

      expect(result.ANTHROPIC_API_KEY).toBe("sk-process-key");
      expect(result.ANTHROPIC_BASE_URL).toBe("https://config.example.com");
      expect(result.OTHER_VAR).toBe("process-value");
    });

    it("should use config env when process.env value is undefined", () => {
      const processEnv = {
        ANTHROPIC_API_KEY: undefined,
        OTHER_VAR: "process-value",
      };
      const configEnv = {
        ANTHROPIC_API_KEY: "sk-config-key",
        ANTHROPIC_BASE_URL: "https://config.example.com",
      };

      const result = mergeClaudeEnv(processEnv, configEnv);

      expect(result.ANTHROPIC_API_KEY).toBe("sk-config-key");
      expect(result.ANTHROPIC_BASE_URL).toBe("https://config.example.com");
      expect(result.OTHER_VAR).toBe("process-value");
    });

    it("should handle empty config env", () => {
      const processEnv = {
        ANTHROPIC_API_KEY: "sk-process-key",
      };
      const configEnv = {};

      const result = mergeClaudeEnv(processEnv, configEnv);

      expect(result.ANTHROPIC_API_KEY).toBe("sk-process-key");
    });

    it("should handle empty process env", () => {
      const processEnv = {};
      const configEnv = {
        ANTHROPIC_API_KEY: "sk-config-key",
      };

      const result = mergeClaudeEnv(processEnv, configEnv);

      expect(result.ANTHROPIC_API_KEY).toBe("sk-config-key");
    });
  });
});
