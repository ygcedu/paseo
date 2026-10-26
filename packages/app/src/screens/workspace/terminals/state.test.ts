import { SEARCH_TERMINAL_NAME } from "@/workspace-search/types";
import { useTerminalLabelStore } from "@/stores/terminal-label-store";
import { createLocalTerminal } from "./create-local-terminal";
import { describe, expect, it, vi } from "vitest";
import {
  collectKnownTerminalIds,
  collectScriptTerminalIds,
  collectStandaloneTerminalIds,
  reconcilePendingScriptTerminals,
  removeTerminalFromPayload,
  upsertCreatedTerminalPayload,
  type ListTerminalsPayload,
} from "@/screens/workspace/terminals/state";
import type { CreateTerminalResponse } from "@getpaseo/protocol/messages";

function listedTerminal(id: string): ListTerminalsPayload["terminals"][number] {
  return { id, name: id, title: id };
}

function createdTerminal(id: string): NonNullable<CreateTerminalResponse["payload"]["terminal"]> {
  return { id, name: id, cwd: "/repo", title: id };
}

describe("workspace terminal state", () => {
  it("retains user labels across stale daemon titles, reloads, renames, and hosts", async () => {
    await useTerminalLabelStore.persist.rehydrate();
    useTerminalLabelStore.setState({ labels: {} });
    useTerminalLabelStore.getState().setLabel("host-a", "terminal", "Local");
    useTerminalLabelStore.getState().setLabel("host-b", "terminal", "Local(2)");
    await useTerminalLabelStore.persist.rehydrate();
    expect(useTerminalLabelStore.getState().labels["host-a"]?.terminal).toBe("Local");
    expect(useTerminalLabelStore.getState().labels["host-b"]?.terminal).toBe("Local(2)");
    useTerminalLabelStore.getState().setLabel("host-a", "terminal", "My shell");
    expect(useTerminalLabelStore.getState().labels["host-a"]?.terminal).toBe("My shell");
    useTerminalLabelStore.getState().removeLabel("host-a", "terminal");
    expect(useTerminalLabelStore.getState().labels["host-a"]?.terminal).toBeUndefined();
    expect(useTerminalLabelStore.getState().labels["host-b"]?.terminal).toBe("Local(2)");
  });
  it("pins the Local label when the daemon initially returns a shell directory title", async () => {
    const terminal = { ...createdTerminal("new"), name: "Local(2)", title: "/repo" };
    const client = {
      listTerminals: vi.fn(async () => ({
        terminals: [{ id: "old", name: "Local", title: "Renamed shell" }],
        requestId: "list",
      })),
      createTerminal: vi.fn(async () => ({ terminal, error: null, requestId: "create" })),
      renameTerminal: vi.fn(async () => ({
        terminalId: "new",
        title: "Local(2)",
        success: true,
        error: null,
        requestId: "rename",
      })),
    };
    const result = await createLocalTerminal({ client, cwd: "/repo", workspaceId: "workspace" });
    expect(client.createTerminal).toHaveBeenCalledWith("/repo", "Local(2)", undefined, {
      workspaceId: "workspace",
    });
    expect(client.renameTerminal).toHaveBeenCalledWith({ terminalId: "new", title: "Local(2)" });
    expect(result.payload.terminal?.title).toBe("Local(2)");
    expect(result.namingError).toBeNull();
  });

  it("keeps the created terminal accessible when naming fails", async () => {
    const terminal = { ...createdTerminal("new"), title: "/repo" };
    const client = {
      listTerminals: vi.fn(async () => ({ terminals: [], requestId: "list" })),
      createTerminal: vi.fn(async () => ({ terminal, error: null, requestId: "create" })),
      renameTerminal: vi.fn(async () => {
        throw new Error("Host disconnected");
      }),
    };
    const result = await createLocalTerminal({ client, cwd: "/repo", workspaceId: "workspace" });
    expect(result.payload.terminal).toBe(terminal);
    expect(result.namingError).toBe("Host disconnected");
  });

  it("keeps pending script terminals until they appear or a fresher list arrives", () => {
    const pending = new Map([
      ["older-than-list", 10],
      ["now-live", 20],
      ["still-pending", 30],
    ]);

    const reconciled = reconcilePendingScriptTerminals(["now-live"], 20)(pending);

    expect(reconciled).toEqual(new Map([["still-pending", 30]]));
  });

  it("returns the same pending map when reconciliation changes nothing", () => {
    const pending = new Map([["still-pending", 30]]);

    const reconciled = reconcilePendingScriptTerminals([], 20)(pending);

    expect(reconciled).toBe(pending);
  });

  it("combines live and pending terminal ids without duplicating script terminals", () => {
    const pendingScriptTerminalIds = new Map([
      ["script-pending", 10],
      ["terminal-1", 10],
    ]);

    expect(
      collectKnownTerminalIds({
        liveTerminalIds: ["terminal-1", "terminal-2"],
        pendingScriptTerminalIds,
      }),
    ).toEqual(["terminal-1", "terminal-2", "script-pending"]);
    expect(
      collectScriptTerminalIds({
        pendingScriptTerminalIds,
        scripts: [{ terminalId: "script-live" }, { terminalId: null }],
      }),
    ).toEqual(new Set(["script-pending", "terminal-1", "script-live"]));
    expect(
      collectStandaloneTerminalIds({
        terminals: [
          listedTerminal("terminal-1"),
          listedTerminal("terminal-2"),
          listedTerminal("script-live"),
          { ...listedTerminal("search-temp"), name: SEARCH_TERMINAL_NAME },
        ],
        scriptTerminalIds: new Set(["terminal-1", "script-live"]),
      }),
    ).toEqual(["terminal-2"]);
  });

  it("updates terminal cache entries for created and closed terminals", () => {
    const current: ListTerminalsPayload = {
      cwd: "/repo",
      requestId: "existing",
      terminals: [listedTerminal("terminal-1")],
    };

    expect(
      upsertCreatedTerminalPayload({
        current,
        terminal: createdTerminal("terminal-2"),
        workspaceDirectory: "/repo",
      }),
    ).toEqual({
      cwd: "/repo",
      requestId: "existing",
      terminals: [
        listedTerminal("terminal-1"),
        { id: "terminal-2", name: "terminal-2", title: "terminal-2" },
      ],
    });
    expect(removeTerminalFromPayload("terminal-1")(current)).toEqual({
      cwd: "/repo",
      requestId: "existing",
      terminals: [],
    });
  });
});
