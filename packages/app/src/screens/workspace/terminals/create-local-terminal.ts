import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";

interface CreateLocalTerminalInput {
  client: Pick<DaemonClient, "listTerminals" | "createTerminal" | "renameTerminal">;
  cwd: string;
  workspaceId: string;
}

export async function createLocalTerminal({ client, cwd, workspaceId }: CreateLocalTerminalInput) {
  const current = await client.listTerminals(cwd, undefined, { workspaceId });
  const names = new Set(current.terminals.flatMap((terminal) => [terminal.name, terminal.title]));
  let number = 1;
  let name = "Local";
  while (names.has(name)) {
    number += 1;
    name = `Local(${number})`;
  }
  const payload = await client.createTerminal(cwd, name, undefined, { workspaceId });
  if (!payload.terminal) return { payload, namingError: null };

  // The shell can publish an OSC title immediately after spawn. Pin the label through the
  // rename operation, which is also what a user rename does, before presenting the tab.
  try {
    const renamed = await client.renameTerminal({ terminalId: payload.terminal.id, title: name });
    if (!renamed.success) throw new Error(renamed.error ?? "Failed to name terminal");
    return {
      payload: { ...payload, terminal: { ...payload.terminal, title: name } },
      namingError: null,
    };
  } catch (error) {
    // Creation has already succeeded: keep its terminal accessible if naming fails.
    return { payload, namingError: error instanceof Error ? error.message : String(error) };
  }
}
