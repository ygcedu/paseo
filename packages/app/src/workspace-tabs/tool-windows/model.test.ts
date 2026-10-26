import { toolWindowGeometry } from "./geometry";
import { describe, expect, it } from "vitest";
import {
  resolveToolWindows,
  moveToolWindow,
  toggleToolWindow,
  minimizeToolWindow,
  revealToolWindow,
} from "./model";
import type { WorkspaceTab } from "@/workspace-tabs/model";

const tabs: WorkspaceTab[] = [
  { tabId: "files", target: { kind: "files" }, createdAt: 1 },
  { tabId: "changes", target: { kind: "changes_tree" }, createdAt: 2 },
  { tabId: "terminal", target: { kind: "terminal", terminalId: "term" }, createdAt: 3 },
];

describe("tool windows", () => {
  it("groups terminal sessions in one region and moves them together", () => {
    const sessions: WorkspaceTab[] = [
      ...tabs,
      { tabId: "second", target: { kind: "terminal", terminalId: "second" }, createdAt: 4 },
    ];
    const initial = resolveToolWindows({ tabs: sessions, focusedTabId: "terminal", hidden: false });
    const moved = moveToolWindow(initial, {
      tabId: "terminal",
      region: "right",
      beforeTabId: null,
    });
    expect(moved.regionByTabId).toEqual({
      files: "left",
      changes: "left",
      terminal: "right",
      second: "right",
    });
    const selected = revealToolWindow(moved, "second");
    expect(selected.selectedTerminalTabId).toBe("second");
    expect(selected.activeByRegion).toEqual({ left: null, right: "second", bottom: null });
    const restored = resolveToolWindows({
      saved: selected,
      tabs: sessions,
      focusedTabId: "second",
      hidden: false,
    });
    expect(restored.regionByTabId).toEqual(moved.regionByTabId);
    expect(restored.activeByRegion.right).toBe("second");
    const closed = resolveToolWindows({
      saved: restored,
      tabs,
      focusedTabId: "files",
      hidden: false,
    });
    expect(closed.selectedTerminalTabId).toBe("terminal");
    expect(closed.activeByRegion.right).toBe("terminal");
    const minimized = resolveToolWindows({
      saved: minimizeToolWindow(closed, "right"),
      tabs,
      focusedTabId: "terminal",
      hidden: false,
    });
    expect(minimized.activeByRegion.right).toBeNull();
  });

  it("combines restored terminals previously placed in separate regions", () => {
    const sessions: WorkspaceTab[] = [
      ...tabs,
      { tabId: "second", target: { kind: "terminal", terminalId: "second" }, createdAt: 4 },
    ];
    const initial = resolveToolWindows({ tabs: sessions, focusedTabId: "terminal", hidden: false });
    const restored = resolveToolWindows({
      saved: {
        ...initial,
        terminalTabIds: undefined,
        selectedTerminalTabId: undefined,
        regionByTabId: { ...initial.regionByTabId, second: "right" },
        activeByRegion: { left: "files", right: "second", bottom: "terminal" },
      },
      tabs: sessions,
      focusedTabId: "second",
      hidden: false,
    });
    expect(restored.regionByTabId.terminal).toBe("right");
    expect(restored.activeByRegion).toEqual({ left: "files", right: "second", bottom: null });
  });

  it("keeps independent active panels in the three regions", () => {
    const initial = resolveToolWindows({ tabs, focusedTabId: "files", hidden: false });
    const withTerminal = toggleToolWindow(initial, "terminal");
    expect(withTerminal.activeByRegion).toEqual({ left: "files", right: null, bottom: "terminal" });
    expect(minimizeToolWindow(withTerminal, "left").activeByRegion).toEqual({
      left: null,
      right: null,
      bottom: "terminal",
    });
    expect(toggleToolWindow(withTerminal, "terminal").activeByRegion.bottom).toBeNull();
  });

  it("moves a configured panel between regions without disabling other panels", () => {
    const initial = resolveToolWindows({ tabs, focusedTabId: "files", hidden: false });
    const withTerminal = toggleToolWindow(initial, "terminal");
    const moved = moveToolWindow(withTerminal, {
      tabId: "files",
      region: "right",
      beforeTabId: null,
    });
    expect(moved.activeByRegion).toEqual({ left: null, right: "files", bottom: "terminal" });
    expect(moved.regionByTabId).toEqual({ files: "right", changes: "left", terminal: "bottom" });
    expect(moved.order).toEqual(["changes", "terminal", "files"]);
    expect(
      moveToolWindow(moved, { tabId: "terminal", region: "left", beforeTabId: "changes" }).order,
    ).toEqual(["terminal", "changes", "files"]);
  });

  it("drops closed panels and restores minimized regions without reopening them", () => {
    const initial = resolveToolWindows({ tabs, focusedTabId: "files", hidden: false });
    const minimized = minimizeToolWindow(initial, "left");
    const restored = resolveToolWindows({
      saved: minimized,
      tabs: tabs.slice(0, 2),
      focusedTabId: "files",
      hidden: false,
    });
    expect(restored.activeByRegion).toEqual({ left: null, right: null, bottom: null });
    expect(restored.order).toEqual(["files", "changes"]);
    expect(restored.regionByTabId).toEqual({ files: "left", changes: "left" });
  });
});

it("reserves space for the conversation when all tool regions are open", () => {
  const state = resolveToolWindows({ tabs, focusedTabId: "files", hidden: false });
  const tools = {
    ...state,
    activeByRegion: { left: "files", right: "changes", bottom: "terminal" },
  };
  const geometry = toolWindowGeometry({ width: 1000, height: 800, tools, hidden: false });
  expect(geometry.main.width).toBe(400);
  expect(geometry.main.height).toBe(540);
  expect(geometry.frames.bottom).toEqual({ left: 44, top: 540, width: 912, height: 260 });
  expect(toolWindowGeometry({ width: 1000, height: 800, tools, hidden: true }).main).toEqual({
    left: 0,
    top: 0,
    width: 1000,
    height: 800,
  });
});
