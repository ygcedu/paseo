import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { Logger } from "pino";

import type { AgentCapabilityFlags, AgentMode } from "../agent-sdk-types.js";
import type { ProviderRuntimeSettings } from "../provider-launch-config.js";
import { findExecutable } from "../../../utils/executable.js";
import { ACPAgentClient } from "./acp-agent.js";
import {
  formatDiagnosticStatus,
  formatProviderDiagnostic,
  formatProviderDiagnosticError,
  resolveBinaryVersion,
  toDiagnosticErrorMessage,
} from "./diagnostic-utils.js";

const DEVIN_CAPABILITIES: AgentCapabilityFlags = {
  supportsStreaming: true,
  supportsSessionPersistence: true,
  supportsDynamicModes: true,
  supportsMcpServers: false,
  supportsReasoningStream: true,
  supportsToolInvocations: true,
};

const DEVIN_MODES: AgentMode[] = [
  {
    id: "accept-edits",
    label: "Code",
    description: "Write and edit code",
  },
  {
    id: "ask",
    label: "Ask",
    description: "Answer questions without code changes",
  },
  {
    id: "plan",
    label: "Plan",
    description: "Plan changes before implementing",
  },
  {
    id: "bypass",
    label: "Bypass Permissions",
    description: "Auto-approve all tool calls",
  },
];

type DevinACPAgentClientOptions = {
  logger: Logger;
  runtimeSettings?: ProviderRuntimeSettings;
};

/** Path to Devin CLI credentials file (set by `devin auth login`). */
const DEVIN_CREDENTIALS_PATH = join(
  process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
  "devin",
  "credentials.toml",
);

export class DevinACPAgentClient extends ACPAgentClient {
  constructor(options: DevinACPAgentClientOptions) {
    super({
      provider: "devin",
      logger: options.logger,
      runtimeSettings: options.runtimeSettings,
      defaultCommand: ["devin", "acp"],
      defaultModes: DEVIN_MODES,
      capabilities: DEVIN_CAPABILITIES,
    });
  }

  override async isAvailable(): Promise<boolean> {
    if (!(await findExecutable("devin"))) return false;
    // Devin uses its own auth system (devin auth login) or WINDSURF_API_KEY.
    // Check for stored credentials or API key.
    return existsSync(DEVIN_CREDENTIALS_PATH) || Boolean(process.env.WINDSURF_API_KEY);
  }

  async getDiagnostic(): Promise<{ diagnostic: string }> {
    try {
      const resolvedBinary = await findExecutable("devin");
      const available = await this.isAvailable();
      const hasCredentials = existsSync(DEVIN_CREDENTIALS_PATH);
      const hasApiKey = Boolean(process.env.WINDSURF_API_KEY);
      let modelsValue = "Not checked";
      let status = formatDiagnosticStatus(available);

      if (!available && resolvedBinary) {
        status = "❌ Not authenticated. Run `devin auth login` or set WINDSURF_API_KEY.";
      }

      if (available) {
        try {
          const models = await this.listModels({ cwd: homedir(), force: false });
          modelsValue = String(models.length);
        } catch (error) {
          modelsValue = `Error - ${toDiagnosticErrorMessage(error)}`;
          status = formatDiagnosticStatus(available, {
            source: "model fetch",
            cause: error,
          });
        }

        if (!modelsValue.startsWith("Error -")) {
          try {
            await this.listModes({ cwd: homedir(), force: false });
          } catch (error) {
            status = formatDiagnosticStatus(available, {
              source: "mode fetch",
              cause: error,
            });
          }
        }
      }

      return {
        diagnostic: formatProviderDiagnostic("Devin", [
          {
            label: "Binary",
            value: resolvedBinary ?? "not found",
          },
          {
            label: "Version",
            value: resolvedBinary ? await resolveBinaryVersion(resolvedBinary) : "unknown",
          },
          {
            label: "Credentials",
            value: hasCredentials ? "found (devin auth login)" : "not found",
          },
          {
            label: "WINDSURF_API_KEY",
            value: hasApiKey ? "set" : "not set",
          },
          { label: "Models", value: modelsValue },
          { label: "Status", value: status },
        ]),
      };
    } catch (error) {
      return {
        diagnostic: formatProviderDiagnosticError("Devin", error),
      };
    }
  }
}
