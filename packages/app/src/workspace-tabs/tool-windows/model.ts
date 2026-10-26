import { z } from "zod";
import type { WorkspaceTab } from "@/workspace-tabs/model";

export const TOOL_WINDOW_REGIONS = ["left", "right", "bottom"] as const;
export const ToolWindowRegionSchema = z.enum(TOOL_WINDOW_REGIONS);
export type ToolWindowRegion = z.infer<typeof ToolWindowRegionSchema>;
export const ToolWindowsSchema = z.strictObject({
  terminalTabIds: z.array(z.string()).optional(),
  selectedTerminalTabId: z.string().nullable().optional(),
  regionByTabId: z.record(z.string(), ToolWindowRegionSchema),
  order: z.array(z.string()),
  activeByRegion: z.strictObject({
    left: z.string().nullable(),
    right: z.string().nullable(),
    bottom: z.string().nullable(),
  }),
  sizes: z.strictObject({
    left: z.number().positive(),
    right: z.number().positive(),
    bottom: z.number().positive(),
  }),
});
export type ToolWindows = z.infer<typeof ToolWindowsSchema>;

type ToolWindowTab = Pick<WorkspaceTab, "tabId" | "target">;

interface ResolveToolWindowsInput {
  saved?: ToolWindows;
  tabs: readonly ToolWindowTab[];
  focusedTabId: string | null;
  hidden: boolean;
}

function defaultRegion(tab: ToolWindowTab): ToolWindowRegion {
  if (tab.target.kind === "files" || tab.target.kind === "changes_tree") return "left";
  if (tab.target.kind === "terminal") return "bottom";
  return "right";
}

export function resolveToolWindows({
  saved,
  tabs,
  focusedTabId,
  hidden,
}: ResolveToolWindowsInput): ToolWindows {
  const regionByTabId: ToolWindows["regionByTabId"] = {};
  for (const tab of tabs)
    regionByTabId[tab.tabId] = saved?.regionByTabId[tab.tabId] ?? defaultRegion(tab);
  const available = new Set(tabs.map((tab) => tab.tabId));
  const order = [...new Set([...(saved?.order ?? []), ...available])].filter((tabId) =>
    available.has(tabId),
  );
  const activeByRegion: ToolWindows["activeByRegion"] = { left: null, right: null, bottom: null };
  if (saved && !hidden) {
    for (const region of TOOL_WINDOW_REGIONS) {
      const tabId = saved.activeByRegion[region];
      if (tabId && regionByTabId[tabId] === region) activeByRegion[region] = tabId;
    }
  } else if (!hidden && focusedTabId && available.has(focusedTabId)) {
    activeByRegion[regionByTabId[focusedTabId]] = focusedTabId;
  }
  return groupTerminalWindows(
    {
      regionByTabId,
      order,
      activeByRegion,
      sizes: saved?.sizes ?? { left: 300, right: 320, bottom: 260 },
    },
    tabs,
    focusedTabId,
    hidden,
    saved,
  );
}

function selectedTerminalVisible(saved: ToolWindows | undefined): boolean {
  const selected = saved?.selectedTerminalTabId;
  if (!saved || !selected) return false;
  const region = saved.regionByTabId[selected];
  return saved.activeByRegion[region] === selected;
}

function groupTerminalWindows(
  state: ToolWindows,
  tabs: readonly ToolWindowTab[],
  focusedTabId: string | null,
  hidden: boolean,
  saved: ToolWindows | undefined,
): ToolWindows {
  const terminalIds = new Set(
    tabs.filter((tab) => tab.target.kind === "terminal").map((tab) => tab.tabId),
  );
  const terminalTabIds = state.order.filter((id) => terminalIds.has(id));
  const candidates = [
    focusedTabId,
    saved?.selectedTerminalTabId,
    ...Object.values(state.activeByRegion),
    ...terminalTabIds,
  ];
  const selectedTerminalTabId =
    candidates.find((id) => typeof id === "string" && terminalIds.has(id)) ?? null;
  const next = { ...state, terminalTabIds, selectedTerminalTabId };
  if (!selectedTerminalTabId) return next;
  const previousSelected = saved?.selectedTerminalTabId ?? selectedTerminalTabId;
  const region =
    saved?.regionByTabId[previousSelected] ?? state.regionByTabId[selectedTerminalTabId];
  let terminalVisible = selectedTerminalVisible(saved);
  for (const candidate of TOOL_WINDOW_REGIONS) {
    const active = state.activeByRegion[candidate];
    if (active && terminalIds.has(active)) {
      terminalVisible = true;
      next.activeByRegion[candidate] = null;
    }
  }
  for (const id of terminalTabIds) next.regionByTabId[id] = region;
  if (!hidden && terminalVisible) next.activeByRegion[region] = selectedTerminalTabId;
  return next;
}

export function revealToolWindow(state: ToolWindows, tabId: string): ToolWindows {
  const region = state.regionByTabId[tabId];
  if (!region) return state;
  return {
    ...state,
    selectedTerminalTabId: state.terminalTabIds?.includes(tabId)
      ? tabId
      : state.selectedTerminalTabId,
    activeByRegion: { ...state.activeByRegion, [region]: tabId },
  };
}

export function toggleToolWindow(state: ToolWindows, tabId: string): ToolWindows {
  const region = state.regionByTabId[tabId];
  if (!region) return state;
  const active = state.activeByRegion[region] === tabId;
  const next = revealToolWindow(state, tabId);
  return { ...next, activeByRegion: { ...next.activeByRegion, [region]: active ? null : tabId } };
}

export function minimizeToolWindow(state: ToolWindows, region: ToolWindowRegion): ToolWindows {
  return { ...state, activeByRegion: { ...state.activeByRegion, [region]: null } };
}

interface MoveToolWindowInput {
  tabId: string;
  region: ToolWindowRegion;
  beforeTabId: string | null;
}

export function moveToolWindow(
  state: ToolWindows,
  { tabId, region, beforeTabId }: MoveToolWindowInput,
): ToolWindows {
  const previous = state.regionByTabId[tabId];
  if (!previous || beforeTabId === tabId) return state;
  const movingIds = state.terminalTabIds?.includes(tabId) ? state.terminalTabIds : [tabId];
  if (beforeTabId && movingIds.includes(beforeTabId)) return state;
  const activeByRegion = { ...state.activeByRegion };
  for (const candidate of TOOL_WINDOW_REGIONS) {
    if (movingIds.includes(activeByRegion[candidate] ?? "")) activeByRegion[candidate] = null;
  }
  activeByRegion[region] = tabId;
  const order = state.order.filter((id) => !movingIds.includes(id));
  const index = beforeTabId ? order.indexOf(beforeTabId) : -1;
  order.splice(index < 0 ? order.length : index, 0, ...movingIds);
  const regionByTabId = { ...state.regionByTabId };
  for (const id of movingIds) regionByTabId[id] = region;
  return {
    ...state,
    selectedTerminalTabId:
      movingIds.length > 1 || state.terminalTabIds?.includes(tabId)
        ? tabId
        : state.selectedTerminalTabId,
    regionByTabId,
    activeByRegion,
    order,
  };
}
