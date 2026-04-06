import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { randomUUID } from "node:crypto";
import type { Logger } from "pino";
import {
  AuthStorage,
  ModelRegistry,
  SessionManager,
  createAgentSession,
  type AgentSession as PiAgentSession,
  type AgentSessionEvent,
} from "@mariozechner/pi-coding-agent";
import type { ThinkingLevel } from "@mariozechner/pi-agent-core";
import type { ImageContent, Model } from "@mariozechner/pi-ai";

import type {
  AgentCapabilityFlags,
  AgentClient,
  AgentLaunchContext,
  AgentMetadata,
  AgentMode,
  AgentModelDefinition,
  AgentPermissionRequest,
  AgentPermissionResponse,
  AgentPersistenceHandle,
  AgentPromptInput,
  AgentRunOptions,
  AgentRunResult,
  AgentRuntimeInfo,
  AgentSession,
  AgentSessionConfig,
  AgentSlashCommand,
  AgentStreamEvent,
  AgentTimelineItem,
  AgentUsage,
  ListModelsOptions,
} from "../agent-sdk-types.js";
import type { ProviderRuntimeSettings } from "../provider-launch-config.js";
import { findExecutable, isCommandAvailable } from "../../../utils/executable.js";
import {
  formatDiagnosticStatus,
  formatProviderDiagnostic,
  formatProviderDiagnosticError,
  resolveBinaryVersion,
  toDiagnosticErrorMessage,
} from "./diagnostic-utils.js";

const PI_PROVIDER = "pi";
const DEFAULT_PI_THINKING_LEVEL: ThinkingLevel = "medium";
const PI_BINARY_COMMAND = process.env.PI_COMMAND ?? process.env.PI_ACP_PI_COMMAND ?? "pi";

const PI_CAPABILITIES: AgentCapabilityFlags = {
  supportsStreaming: true,
  supportsSessionPersistence: true,
  supportsDynamicModes: true,
  supportsMcpServers: false,
  supportsReasoningStream: true,
  supportsToolInvocations: true,
};

const PI_THINKING_OPTIONS: ReadonlyArray<{
  id: ThinkingLevel;
  label: string;
  description: string;
  isDefault?: boolean;
}> = [
  { id: "off", label: "Off", description: "No extra reasoning" },
  { id: "minimal", label: "Minimal", description: "Light reasoning" },
  { id: "low", label: "Low", description: "Faster reasoning" },
  { id: "medium", label: "Medium", description: "Balanced reasoning", isDefault: true },
  { id: "high", label: "High", description: "Deeper reasoning" },
  { id: "xhigh", label: "XHigh", description: "Maximum reasoning" },
] as const;

type PiDirectAgentClientOptions = {
  logger: Logger;
  runtimeSettings?: ProviderRuntimeSettings;
};

function normalizePiModelLabel(label: string): string {
  return label.trim().replace(/[_\s]+/g, " ");
}

export function transformPiModels(models: AgentModelDefinition[]): AgentModelDefinition[] {
  return models.map((model) => {
    if (!model.label.includes("/")) {
      return model;
    }

    const segments = model.label.split("/").filter((segment) => segment.length > 0);
    const rawLabel = segments.at(-1);
    if (!rawLabel) {
      return model;
    }

    return {
      ...model,
      label: normalizePiModelLabel(rawLabel),
      description: model.description ?? model.label,
    };
  });
}

function isPiThinkingLevel(value: string | null | undefined): value is ThinkingLevel {
  return (
    value === "off" ||
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh"
  );
}

function normalizePiThinkingOption(
  value: string | null | undefined,
): ThinkingLevel | null {
  if (!value) {
    return null;
  }
  return isPiThinkingLevel(value) ? value : null;
}

function toAgentUsage(stats: ReturnType<PiAgentSession["getSessionStats"]>): AgentUsage | undefined {
  const inputTokens = stats.tokens.input;
  const cachedInputTokens = stats.tokens.cacheRead;
  const outputTokens = stats.tokens.output;
  const totalCostUsd = stats.cost;

  if (
    inputTokens === 0 &&
    cachedInputTokens === 0 &&
    outputTokens === 0 &&
    totalCostUsd === 0
  ) {
    return undefined;
  }

  return {
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalCostUsd,
  };
}

function convertPromptInput(
  prompt: AgentPromptInput,
): { text: string; images?: ImageContent[] } {
  if (typeof prompt === "string") {
    return { text: prompt };
  }

  const textParts: string[] = [];
  const images: ImageContent[] = [];

  for (const block of prompt) {
    if (block.type === "text") {
      textParts.push(block.text);
      continue;
    }
    images.push({
      type: "image",
      data: block.data,
      mimeType: block.mimeType,
    });
  }

  return {
    text: textParts.join("\n\n"),
    ...(images.length > 0 ? { images } : {}),
  };
}

function extractTextFromToolResult(result: unknown): string | undefined {
  if (typeof result === "string") {
    return result;
  }
  if (!result || typeof result !== "object") {
    return undefined;
  }

  const record = result as Record<string, unknown>;
  const directText =
    typeof record.output === "string"
      ? record.output
      : typeof record.stdout === "string"
        ? record.stdout
        : typeof record.text === "string"
          ? record.text
          : undefined;
  if (directText) {
    return directText;
  }

  if (!Array.isArray(record.content)) {
    return undefined;
  }

  const textParts = record.content
    .filter(
      (block): block is { type?: unknown; text?: unknown } =>
        typeof block === "object" && block !== null,
    )
    .map((block) => (block.type === "text" && typeof block.text === "string" ? block.text : ""))
    .filter((text) => text.length > 0);

  return textParts.length > 0 ? textParts.join("\n") : undefined;
}

function resolveToolCallOutput(result: unknown): { output?: string; exitCode?: number | null } {
  if (typeof result === "string") {
    return { output: result };
  }
  if (!result || typeof result !== "object") {
    return {};
  }

  const record = result as Record<string, unknown>;
  const output = extractTextFromToolResult(result);
  const exitCode =
    typeof record.exitCode === "number"
      ? record.exitCode
      : typeof record.code === "number"
        ? record.code
        : null;

  return { output, exitCode };
}

function mapToolDetail(
  toolName: string,
  args: Record<string, unknown> | null,
  result?: unknown,
) {
  const safeArgs = args ?? {};

  switch (toolName) {
    case "bash": {
      const { output, exitCode } = resolveToolCallOutput(result);
      return {
        type: "shell" as const,
        command: typeof safeArgs.command === "string" ? safeArgs.command : "",
        cwd: typeof safeArgs.cwd === "string" ? safeArgs.cwd : undefined,
        output,
        exitCode,
      };
    }
    case "read":
      return {
        type: "read" as const,
        filePath: typeof safeArgs.path === "string" ? safeArgs.path : "",
        content: extractTextFromToolResult(result),
      };
    case "edit": {
      const firstEdit =
        Array.isArray(safeArgs.edits) && safeArgs.edits[0] && typeof safeArgs.edits[0] === "object"
          ? (safeArgs.edits[0] as Record<string, unknown>)
          : null;
      return {
        type: "edit" as const,
        filePath: typeof safeArgs.path === "string" ? safeArgs.path : "",
        oldString:
          typeof firstEdit?.oldText === "string"
            ? firstEdit.oldText
            : typeof safeArgs.old_string === "string"
            ? safeArgs.old_string
            : typeof safeArgs.oldString === "string"
              ? safeArgs.oldString
              : undefined,
        newString:
          typeof firstEdit?.newText === "string"
            ? firstEdit.newText
            : typeof safeArgs.new_string === "string"
            ? safeArgs.new_string
            : typeof safeArgs.newString === "string"
              ? safeArgs.newString
              : undefined,
        unifiedDiff:
          typeof (result as { details?: { diff?: unknown } } | null)?.details?.diff === "string"
            ? (result as { details: { diff: string } }).details.diff
            : undefined,
      };
    }
    case "write":
      return {
        type: "write" as const,
        filePath: typeof safeArgs.path === "string" ? safeArgs.path : "",
        content: typeof safeArgs.content === "string" ? safeArgs.content : undefined,
      };
    case "find":
    case "grep":
    case "ls":
      return {
        type: "search" as const,
        query:
          typeof safeArgs.pattern === "string"
            ? safeArgs.pattern
            : typeof safeArgs.path === "string"
              ? safeArgs.path
              : toolName,
        ...(toolName === "find"
          ? { toolName: "search" as const }
          : toolName === "grep"
            ? { toolName: "grep" as const }
            : {}),
        content: typeof result === "string" ? result : undefined,
      };
    default:
      return {
        type: "unknown" as const,
        input: safeArgs,
        output: result ?? null,
      };
  }
}

function stringifyUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === "string" ? error : "Unknown Pi error";
}

function parseModelReference(modelId: string | null): { provider?: string; id: string } | null {
  if (!modelId) {
    return null;
  }
  if (modelId.includes("/")) {
    const [provider, ...rest] = modelId.split("/");
    const id = rest.join("/");
    if (provider && id) {
      return { provider, id };
    }
  }
  if (modelId.includes(":")) {
    const [provider, ...rest] = modelId.split(":");
    const id = rest.join(":");
    if (provider && id) {
      return { provider, id };
    }
  }
  return { id: modelId };
}

function buildSlashCommands(session: PiAgentSession): AgentSlashCommand[] {
  const commands: AgentSlashCommand[] = [];
  const registeredCommands =
    (
      session.extensionRunner as
        | { getCommands?: () => Array<{ name: string; description?: string }> }
        | undefined
    )?.getCommands?.() ?? [];

  for (const command of registeredCommands) {
    if (!command?.name) {
      continue;
    }
    commands.push({
      name: command.name,
      description: command.description ?? "Extension command",
      argumentHint: "",
    });
  }

  for (const template of session.promptTemplates) {
    commands.push({
      name: template.name,
      description: template.description ?? "Prompt template",
      argumentHint: "",
    });
  }

  const resourceLoader = (session as unknown as {
    resourceLoader?: { getSkills?: () => { skills?: Array<{ name: string; description?: string }> } };
  }).resourceLoader;
  const skills = resourceLoader?.getSkills?.().skills ?? [];
  for (const skill of skills) {
    if (!skill?.name) {
      continue;
    }
    commands.push({
      name: `skill:${skill.name}`,
      description: skill.description ?? "Skill",
      argumentHint: "",
    });
  }

  return commands;
}

function applySystemPrompt(session: PiAgentSession, systemPrompt: string | undefined): void {
  const trimmed = systemPrompt?.trim();
  if (!trimmed) {
    return;
  }

  const mutable = session as unknown as {
    _baseSystemPrompt?: string;
    agent: { state: { systemPrompt: string } };
  };
  const currentBase = mutable._baseSystemPrompt ?? mutable.agent.state.systemPrompt ?? "";
  const combined = currentBase ? `${currentBase}\n\n${trimmed}` : trimmed;
  mutable._baseSystemPrompt = combined;
  mutable.agent.state.systemPrompt = combined;
}

export class PiDirectAgentSession implements AgentSession {
  readonly provider = PI_PROVIDER;
  readonly capabilities = PI_CAPABILITIES;

  private readonly subscribers = new Set<(event: AgentStreamEvent) => void>();
  private readonly activeToolCalls = new Map<
    string,
    { toolName: string; args: Record<string, unknown> | null }
  >();
  private activeTurnId: string | null = null;
  private lastKnownThinkingOptionId: string | null;
  private latestUsage: AgentUsage | undefined;

  constructor(
    private readonly session: PiAgentSession,
    private readonly modelRegistry: ModelRegistry,
    private readonly config: AgentSessionConfig,
  ) {
    this.lastKnownThinkingOptionId =
      normalizePiThinkingOption(config.thinkingOptionId) ?? session.thinkingLevel ?? null;

    this.session.subscribe((event) => {
      this.handleSessionEvent(event);
    });
  }

  get id(): string | null {
    return this.session.sessionId;
  }

  private emit(event: AgentStreamEvent): void {
    for (const subscriber of this.subscribers) {
      subscriber(event);
    }
  }

  private currentTurnIdForEvent(): string | undefined {
    return this.activeTurnId ?? undefined;
  }

  private handleSessionEvent(event: AgentSessionEvent): void {
    const turnId = this.currentTurnIdForEvent();

    switch (event.type) {
      case "agent_start":
        this.emit({
          type: "thread_started",
          provider: PI_PROVIDER,
          sessionId: this.session.sessionId,
        });
        return;
      case "turn_start":
        this.emit({
          type: "turn_started",
          provider: PI_PROVIDER,
          turnId,
        });
        return;
      case "message_update":
        if (event.message.role !== "assistant") {
          return;
        }
        if (event.assistantMessageEvent.type === "text_delta") {
          this.emit({
            type: "timeline",
            provider: PI_PROVIDER,
            turnId,
            item: {
              type: "assistant_message",
              text: event.assistantMessageEvent.delta ?? "",
            },
          });
          return;
        }
        if (event.assistantMessageEvent.type === "thinking_delta") {
          this.emit({
            type: "timeline",
            provider: PI_PROVIDER,
            turnId,
            item: {
              type: "reasoning",
              text: event.assistantMessageEvent.delta ?? "",
            },
          });
        }
        return;
      case "tool_execution_start":
        this.activeToolCalls.set(event.toolCallId, {
          toolName: event.toolName,
          args: event.args as Record<string, unknown> | null,
        });
        this.emit({
          type: "timeline",
          provider: PI_PROVIDER,
          turnId,
          item: {
            type: "tool_call",
            callId: event.toolCallId,
            name: event.toolName,
            status: "running",
            detail: mapToolDetail(event.toolName, event.args as Record<string, unknown> | null),
            error: null,
          },
        });
        return;
      case "tool_execution_update": {
        const activeToolCall = this.activeToolCalls.get(event.toolCallId);
        this.emit({
          type: "timeline",
          provider: PI_PROVIDER,
          turnId,
          item: {
            type: "tool_call",
            callId: event.toolCallId,
            name: event.toolName,
            status: "running",
            detail: mapToolDetail(
              activeToolCall?.toolName ?? event.toolName,
              activeToolCall?.args ?? null,
              event.partialResult,
            ),
            error: null,
          },
        });
        return;
      }
      case "tool_execution_end": {
        const completedToolCall = this.activeToolCalls.get(event.toolCallId);
        this.activeToolCalls.delete(event.toolCallId);
        this.emit({
          type: "timeline",
          provider: PI_PROVIDER,
          turnId,
          item: {
            type: "tool_call",
            callId: event.toolCallId,
            name: event.toolName,
            status: event.isError ? "failed" : "completed",
            detail: mapToolDetail(
              completedToolCall?.toolName ?? event.toolName,
              completedToolCall?.args ?? null,
              event.result,
            ),
            error: event.isError ? event.result : null,
          },
        });
        return;
      }
      case "turn_end":
        return;
      case "compaction_start":
        this.emit({
          type: "timeline",
          provider: PI_PROVIDER,
          turnId,
          item: {
            type: "compaction",
            status: "loading",
            trigger: event.reason === "manual" ? "manual" : "auto",
          },
        });
        return;
      case "compaction_end":
        this.emit({
          type: "timeline",
          provider: PI_PROVIDER,
          turnId,
          item: {
            type: "compaction",
            status: "completed",
          },
        });
        return;
      case "agent_end": {
        this.latestUsage = toAgentUsage(this.session.getSessionStats());
        const currentTurnId = turnId;
        this.activeTurnId = null;
        if (this.session.agent.state.errorMessage) {
          this.emit({
            type: "turn_failed",
            provider: PI_PROVIDER,
            turnId: currentTurnId,
            error: this.session.agent.state.errorMessage,
          });
          return;
        }
        this.emit({
          type: "turn_completed",
          provider: PI_PROVIDER,
          turnId: currentTurnId,
          usage: this.latestUsage,
        });
        return;
      }
      default:
        return;
    }
  }

  async run(prompt: AgentPromptInput, options?: AgentRunOptions): Promise<AgentRunResult> {
    const timeline: AgentTimelineItem[] = [];
    let finalText = "";
    let usage: AgentUsage | undefined;
    let turnId: string | null = null;
    const bufferedEvents: AgentStreamEvent[] = [];
    let settled = false;
    let resolveCompletion!: () => void;
    let rejectCompletion!: (error: Error) => void;

    const processEvent = (event: AgentStreamEvent) => {
      if (settled) {
        return;
      }
      const eventTurnId = (event as { turnId?: string }).turnId;
      if (turnId && eventTurnId && eventTurnId !== turnId) {
        return;
      }
      if (event.type === "timeline") {
        timeline.push(event.item);
        if (event.item.type === "assistant_message") {
          finalText += event.item.text;
        }
        return;
      }
      if (event.type === "turn_completed") {
        usage = event.usage;
        settled = true;
        resolveCompletion();
        return;
      }
      if (event.type === "turn_failed") {
        settled = true;
        rejectCompletion(new Error(event.error));
      }
    };

    const completion = new Promise<void>((resolve, reject) => {
      resolveCompletion = resolve;
      rejectCompletion = reject;
    });
    const unsubscribe = this.subscribe((event) => {
      if (!turnId) {
        bufferedEvents.push(event);
        return;
      }
      processEvent(event);
    });

    try {
      const result = await this.startTurn(prompt, options);
      turnId = result.turnId;
      for (const event of bufferedEvents) {
        processEvent(event);
      }
      if (!settled) {
        await completion;
      }
    } finally {
      unsubscribe();
    }

    return {
      sessionId: this.session.sessionId,
      finalText,
      usage,
      timeline,
    };
  }

  async startTurn(
    prompt: AgentPromptInput,
    _options?: AgentRunOptions,
  ): Promise<{ turnId: string }> {
    if (this.activeTurnId) {
      throw new Error("A Pi turn is already active");
    }

    const { text, images } = convertPromptInput(prompt);
    const turnId = randomUUID();
    this.activeTurnId = turnId;

    void this.session
      .prompt(text, images ? { images } : undefined)
      .catch((error) => {
        const failedTurnId = this.activeTurnId ?? turnId;
        this.activeTurnId = null;
        this.emit({
          type: "turn_failed",
          provider: PI_PROVIDER,
          turnId: failedTurnId,
          error: stringifyUnknownError(error),
        });
      });

    return { turnId };
  }

  subscribe(callback: (event: AgentStreamEvent) => void): () => void {
    this.subscribers.add(callback);
    return () => {
      this.subscribers.delete(callback);
    };
  }

  async *streamHistory(): AsyncGenerator<AgentStreamEvent> {
    for (const message of this.session.messages) {
      if (message.role === "user") {
        const text =
          typeof message.content === "string"
            ? message.content
            : message.content
                .filter((block): block is Extract<typeof block, { type: "text" }> => block.type === "text")
                .map((block) => block.text)
                .join("\n\n");
        if (text) {
          yield {
            type: "timeline",
            provider: PI_PROVIDER,
            item: { type: "user_message", text },
          };
        }
        continue;
      }

      if (message.role !== "assistant") {
        continue;
      }

      for (const content of message.content) {
        if (content.type === "text" && content.text) {
          yield {
            type: "timeline",
            provider: PI_PROVIDER,
            item: { type: "assistant_message", text: content.text },
          };
          continue;
        }
        if (content.type === "thinking" && content.thinking) {
          yield {
            type: "timeline",
            provider: PI_PROVIDER,
            item: { type: "reasoning", text: content.thinking },
          };
        }
      }
    }
  }

  async getRuntimeInfo(): Promise<AgentRuntimeInfo> {
    return {
      provider: PI_PROVIDER,
      sessionId: this.session.sessionId,
      model: this.session.model ? `${this.session.model.provider}/${this.session.model.id}` : null,
      thinkingOptionId:
        normalizePiThinkingOption(this.lastKnownThinkingOptionId ?? this.session.thinkingLevel) ??
        null,
      modeId: null,
    };
  }

  async getAvailableModes(): Promise<AgentMode[]> {
    return [];
  }

  async getCurrentMode(): Promise<string | null> {
    return null;
  }

  async setMode(modeId: string): Promise<void> {
    void modeId;
    throw new Error("Pi does not expose selectable modes");
  }

  getPendingPermissions(): AgentPermissionRequest[] {
    return [];
  }

  async respondToPermission(
    requestId: string,
    response: AgentPermissionResponse,
  ): Promise<void> {
    void requestId;
    void response;
  }

  describePersistence(): AgentPersistenceHandle | null {
    return {
      provider: PI_PROVIDER,
      sessionId: this.session.sessionId,
      nativeHandle: this.session.sessionManager.getSessionFile(),
      metadata: {
        cwd: this.session.sessionManager.getCwd(),
      },
    };
  }

  async interrupt(): Promise<void> {
    await this.session.abort();
  }

  async close(): Promise<void> {
    this.session.dispose();
  }

  async listCommands(): Promise<AgentSlashCommand[]> {
    return buildSlashCommands(this.session);
  }

  async setModel(modelId: string | null): Promise<void> {
    const parsed = parseModelReference(modelId);
    if (!parsed) {
      return;
    }

    const model =
      parsed.provider && parsed.id
        ? this.modelRegistry.find(parsed.provider, parsed.id)
        : this.modelRegistry.getAll().find(
            (entry) => entry.id === parsed.id || `${entry.provider}/${entry.id}` === parsed.id,
          );

    if (!model) {
      throw new Error(`Unknown Pi model: ${modelId}`);
    }

    await this.session.setModel(model);
    this.config.model = `${model.provider}/${model.id}`;
  }

  async setThinkingOption(thinkingOptionId: string | null): Promise<void> {
    const thinkingLevel =
      normalizePiThinkingOption(thinkingOptionId) ?? DEFAULT_PI_THINKING_LEVEL;
    this.session.setThinkingLevel(thinkingLevel);
    this.lastKnownThinkingOptionId = thinkingLevel;
    this.config.thinkingOptionId = thinkingLevel;
  }
}

export class PiDirectAgentClient implements AgentClient {
  readonly provider = PI_PROVIDER;
  readonly capabilities = PI_CAPABILITIES;

  private readonly logger: Logger;
  private readonly runtimeSettings?: ProviderRuntimeSettings;
  private modelRegistry: ModelRegistry | null = null;

  constructor(options: PiDirectAgentClientOptions) {
    this.logger = options.logger;
    this.runtimeSettings = options.runtimeSettings;
  }

  private getModelRegistry(): ModelRegistry {
    if (!this.modelRegistry) {
      this.modelRegistry = ModelRegistry.create(AuthStorage.create());
    }
    return this.modelRegistry;
  }

  private resolveConfiguredModel(modelId: string | null | undefined): Model<any> | undefined {
    const parsed = parseModelReference(modelId ?? null);
    if (!parsed) {
      return undefined;
    }

    const registry = this.getModelRegistry();
    if (parsed.provider && parsed.id) {
      return registry.find(parsed.provider, parsed.id);
    }
    return registry.getAll().find(
      (model) => model.id === parsed.id || `${model.provider}/${model.id}` === parsed.id,
    );
  }

  private async createSdkSession(config: AgentSessionConfig): Promise<PiAgentSession> {
    const thinkingLevel =
      normalizePiThinkingOption(config.thinkingOptionId) ?? DEFAULT_PI_THINKING_LEVEL;
    const modelRegistry = this.getModelRegistry();
    const { session } = await createAgentSession({
      cwd: config.cwd,
      modelRegistry,
      sessionManager: SessionManager.create(config.cwd),
      ...(this.resolveConfiguredModel(config.model) ? { model: this.resolveConfiguredModel(config.model) } : {}),
      thinkingLevel,
    });
    await session.bindExtensions({});
    applySystemPrompt(session, config.systemPrompt);
    return session;
  }

  async createSession(
    config: AgentSessionConfig,
    _launchContext?: AgentLaunchContext,
  ): Promise<AgentSession> {
    const session = await this.createSdkSession(config);
    return new PiDirectAgentSession(session, this.getModelRegistry(), config);
  }

  async resumeSession(
    handle: AgentPersistenceHandle,
    overrides?: Partial<AgentSessionConfig>,
    _launchContext?: AgentLaunchContext,
  ): Promise<AgentSession> {
    const sessionFile = handle.nativeHandle;
    if (!sessionFile) {
      throw new Error("Pi resume requires a native session file handle");
    }

    const resumedManager = SessionManager.open(sessionFile);
    const mergedConfig: AgentSessionConfig = {
      provider: PI_PROVIDER,
      cwd:
        overrides?.cwd ??
        (typeof handle.metadata?.cwd === "string" ? handle.metadata.cwd : resumedManager.getCwd()),
      model: overrides?.model,
      thinkingOptionId: overrides?.thinkingOptionId,
      systemPrompt: overrides?.systemPrompt,
      featureValues: overrides?.featureValues,
      title: overrides?.title,
      approvalPolicy: overrides?.approvalPolicy,
      sandboxMode: overrides?.sandboxMode,
      networkAccess: overrides?.networkAccess,
      webSearch: overrides?.webSearch,
      extra: overrides?.extra,
      mcpServers: overrides?.mcpServers,
      internal: overrides?.internal,
      modeId: overrides?.modeId,
    };

    const { session } = await createAgentSession({
      cwd: mergedConfig.cwd,
      modelRegistry: this.getModelRegistry(),
      sessionManager: resumedManager,
      ...(this.resolveConfiguredModel(mergedConfig.model)
        ? { model: this.resolveConfiguredModel(mergedConfig.model) }
        : {}),
      ...(normalizePiThinkingOption(mergedConfig.thinkingOptionId)
        ? {
            thinkingLevel: normalizePiThinkingOption(
              mergedConfig.thinkingOptionId,
            ) as ThinkingLevel,
          }
        : {}),
    });
    await session.bindExtensions({});
    applySystemPrompt(session, mergedConfig.systemPrompt);
    return new PiDirectAgentSession(session, this.getModelRegistry(), mergedConfig);
  }

  async listModels(_options?: ListModelsOptions): Promise<AgentModelDefinition[]> {
    const models = this.getModelRegistry().getAll().map((model) => ({
      provider: PI_PROVIDER,
      id: `${model.provider}/${model.id}`,
      label: `${model.provider}/${model.name}`,
      description: `${model.provider}/${model.id}`,
      metadata: {
        provider: model.provider,
        modelId: model.id,
      } satisfies AgentMetadata,
      thinkingOptions: model.reasoning
        ? PI_THINKING_OPTIONS.map((option) => ({
            id: option.id,
            label: option.label,
            description: option.description,
            ...(option.isDefault ? { isDefault: true } : {}),
          }))
        : undefined,
      defaultThinkingOptionId: model.reasoning ? DEFAULT_PI_THINKING_LEVEL : undefined,
    }));

    return transformPiModels(models);
  }

  async listModes(): Promise<AgentMode[]> {
    return [];
  }

  async isAvailable(): Promise<boolean> {
    const command = this.runtimeSettings?.command;
    if (command?.mode === "replace" && command.argv[0]) {
      if (!existsSync(command.argv[0])) {
        return false;
      }
    } else if (!isCommandAvailable(PI_BINARY_COMMAND)) {
      return false;
    }

    return (
      Boolean(process.env.OPENAI_API_KEY) ||
      Boolean(process.env.ANTHROPIC_API_KEY) ||
      Boolean(process.env.OPENROUTER_API_KEY) ||
      existsSync(join(homedir(), ".pi", "agent", "auth.json"))
    );
  }

  async getDiagnostic(): Promise<{ diagnostic: string }> {
    try {
      const available = await this.isAvailable();
      const binary =
        this.runtimeSettings?.command?.mode === "replace" && this.runtimeSettings.command.argv[0]
          ? this.runtimeSettings.command.argv[0]
          : findExecutable(PI_BINARY_COMMAND);
      const version = binary ? resolveBinaryVersion(binary) : "unknown";
      const authConfigPath = join(homedir(), ".pi", "agent", "auth.json");
      let modelsValue = "Not checked";
      let status = formatDiagnosticStatus(available);

      if (available) {
        try {
          const models = await this.listModels();
          modelsValue = String(models.length);
        } catch (error) {
          modelsValue = `Error - ${toDiagnosticErrorMessage(error)}`;
          status = formatDiagnosticStatus(available, {
            source: "model fetch",
            cause: error,
          });
        }
      }

      return {
        diagnostic: formatProviderDiagnostic("Pi", [
          { label: "Binary", value: binary ?? "not found" },
          { label: "Version", value: version },
          {
            label: "OPENAI_API_KEY",
            value: process.env.OPENAI_API_KEY ? "set" : "not set",
          },
          {
            label: "ANTHROPIC_API_KEY",
            value: process.env.ANTHROPIC_API_KEY ? "set" : "not set",
          },
          {
            label: "OPENROUTER_API_KEY",
            value: process.env.OPENROUTER_API_KEY ? "set" : "not set",
          },
          {
            label: "Auth config (~/.pi/agent/auth.json)",
            value: existsSync(authConfigPath) ? "found" : "not found",
          },
          { label: "Models", value: modelsValue },
          { label: "Status", value: status },
        ]),
      };
    } catch (error) {
      this.logger.debug({ err: error }, "Pi diagnostic lookup failed");
      return {
        diagnostic: formatProviderDiagnosticError("Pi", error),
      };
    }
  }
}
