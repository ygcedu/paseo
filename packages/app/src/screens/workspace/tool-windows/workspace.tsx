import type { ToolWindowMenuBuilder } from "./actions";
import { useCallback, useEffect, useLayoutEffect, useMemo, useState, type ReactNode } from "react";
import { View, type LayoutChangeEvent } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { WorkspacePanelHost } from "@/screens/workspace/workspace-panel-host";
import { deriveWorkspacePaneState } from "@/screens/workspace/workspace-pane-state";
import type { WorkspacePaneContentModel } from "@/screens/workspace/workspace-pane-content";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import { useWorkspaceLayoutStore, type SplitPane } from "@/stores/workspace-layout-store";
import type { WorkspaceTab } from "@/workspace-tabs/model";
import { ResizeHandle } from "@/components/resize-handle";
import { ToolWindowRailGroup } from "./rail";
import { TerminalToolWindowTabs } from "./terminal-tabs";
import { ToolWindowPanel } from "./panel";
import {
  toolWindowGeometry,
  insetToolWindowFrame,
  TOOL_WINDOW_RAIL_WIDTH,
  TOOL_WINDOW_PANEL_INSET,
  type ToolWindowFrame,
} from "@/workspace-tabs/tool-windows/geometry";
import {
  resolveToolWindows,
  TOOL_WINDOW_REGIONS,
  type ToolWindowRegion,
  type ToolWindows,
} from "@/workspace-tabs/tool-windows/model";

interface ToolWindowWorkspaceProps {
  workspaceKey: string;
  serverId: string;
  workspaceId: string;
  pane: SplitPane | null;
  uiTabs: WorkspaceTab[];
  isWorkspaceFocused: boolean;
  focusModeEnabled: boolean;
  buildTabMenu: ToolWindowMenuBuilder;
  buildPaneContentModel: (input: {
    paneId: string;
    tab: WorkspaceTabDescriptor;
  }) => WorkspacePaneContentModel;
  children: ReactNode;
}
interface ResizeProps {
  workspaceKey: string;
  region: ToolWindowRegion;
  frame: ToolWindowFrame;
  width: number;
  height: number;
  onPreview: (region: ToolWindowRegion, size: number | null) => void;
}
function ToolWindowResize({ workspaceKey, region, frame, width, height, onPreview }: ResizeProps) {
  const resize = useWorkspaceLayoutStore((state) => state.resizeToolWindow);
  const vertical = region === "bottom";
  const containerSize = vertical ? height : width;
  const index = region === "left" ? 0 : 1;
  const size = vertical ? frame.height : frame.width;
  const ratio = containerSize > 0 ? size / containerSize : 0;
  const sizes = useMemo(
    () => (index === 0 ? [ratio, 1 - ratio] : [1 - ratio, ratio]),
    [index, ratio],
  );
  const preview = useCallback(
    (_id: string, values: number[]) => onPreview(region, values[index] * containerSize),
    [onPreview, region, index, containerSize],
  );
  const commit = useCallback(
    (_id: string, values: number[]) => {
      onPreview(region, null);
      resize(workspaceKey, region, values[index] * containerSize);
    },
    [onPreview, resize, workspaceKey, region, index, containerSize],
  );
  const style = useMemo(() => {
    if (vertical)
      return [styles.resize, { left: frame.left, top: frame.top, width: frame.width, height: 1 }];
    const left = region === "left" ? frame.left + frame.width : frame.left;
    return [styles.resize, { left, top: 0, width: 1, height: frame.height }];
  }, [vertical, region, frame]);
  return (
    <View style={style}>
      <ResizeHandle
        testID={`tool-window-resize-${region}`}
        direction={vertical ? "vertical" : "horizontal"}
        groupId={`tool-window:${region}`}
        index={0}
        sizes={sizes}
        containerSize={containerSize}
        onPreviewResizeSplit={preview}
        onResizeSplit={commit}
      />
    </View>
  );
}

export function ToolWindowWorkspace({
  workspaceKey,
  serverId,
  workspaceId,
  pane,
  uiTabs,
  isWorkspaceFocused,
  focusModeEnabled,
  buildTabMenu,
  buildPaneContentModel,
  children,
}: ToolWindowWorkspaceProps) {
  const consolidateTerminals = useWorkspaceLayoutStore((state) => state.consolidateTerminals);
  useLayoutEffect(
    () => consolidateTerminals(workspaceKey),
    [consolidateTerminals, workspaceKey, uiTabs, pane],
  );
  const saved = useWorkspaceLayoutStore((state) => state.toolWindowsByWorkspace[workspaceKey]);
  const paneState = useMemo(() => deriveWorkspacePaneState({ pane, tabs: uiTabs }), [pane, uiTabs]);
  const tabs = useMemo(
    () => (pane ? paneState.tabs.map((tab) => tab.descriptor) : []),
    [pane, paneState.tabs],
  );
  const tools = useMemo(
    () =>
      resolveToolWindows({
        saved,
        tabs,
        focusedTabId: paneState.activeTabId,
        hidden: pane?.hidden === true,
      }),
    [saved, tabs, paneState.activeTabId, pane?.hidden],
  );
  const [focusedToolTabId, setFocusedToolTabId] = useState<string | null>(null);
  useEffect(() => {
    setFocusedToolTabId(paneState.activeTabId);
  }, [paneState.activeTabId]);
  const focusMain = useCallback(() => setFocusedToolTabId(null), []);
  const [bounds, setBounds] = useState({ width: 0, height: 0 });
  const [previewSizes, setPreviewSizes] = useState<Partial<ToolWindows["sizes"]>>({});
  const displayedTools = useMemo(
    () => ({ ...tools, sizes: { ...tools.sizes, ...previewSizes } }),
    [tools, previewSizes],
  );
  const geometry = useMemo(
    () => toolWindowGeometry({ ...bounds, tools: displayedTools, hidden: focusModeEnabled }),
    [bounds, displayedTools, focusModeEnabled],
  );
  const visibleTabIds = useMemo(() => {
    if (focusModeEnabled || pane?.hidden === true) return new Set<string>();
    return new Set(
      Object.values(tools.activeByRegion).filter((tabId): tabId is string => tabId !== null),
    );
  }, [tools.activeByRegion, focusModeEnabled, pane?.hidden]);
  const orderedTabs = useMemo(() => {
    const byId = new Map(tabs.map((tab) => [tab.tabId, tab]));
    return tools.order.flatMap((id) => {
      const tab = byId.get(id);
      return tab ? [tab] : [];
    });
  }, [tabs, tools.order]);
  const terminalTabs = useMemo(
    () => orderedTabs.filter((tab) => tab.target.kind === "terminal"),
    [orderedTabs],
  );
  const otherTabs = useMemo(() => tabs.filter((tab) => tab.target.kind !== "terminal"), [tabs]);
  const byRegion = useMemo(
    () => ({
      left: orderedTabs.filter((tab) => tools.regionByTabId[tab.tabId] === "left"),
      right: orderedTabs.filter((tab) => tools.regionByTabId[tab.tabId] === "right"),
      bottom: orderedTabs.filter((tab) => tools.regionByTabId[tab.tabId] === "bottom"),
    }),
    [orderedTabs, tools.regionByTabId],
  );
  const measure = useCallback((event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    if (width <= 0 || height <= 0) return;
    setBounds((current) =>
      current.width === width && current.height === height ? current : { width, height },
    );
  }, []);
  const preview = useCallback((region: ToolWindowRegion, size: number | null) => {
    setPreviewSizes((current) => {
      const next = { ...current };
      if (size === null) delete next[region];
      else next[region] = size;
      return next;
    });
  }, []);
  const panelsStyle = useMemo(
    () => [styles.panels, visibleTabIds.size === 0 && styles.hidden],
    [visibleTabIds.size],
  );
  const mainStyle = useMemo(
    () => [
      styles.main,
      !focusModeEnabled && styles.framedMain,
      focusModeEnabled ? geometry.main : insetToolWindowFrame(geometry.main),
    ],
    [geometry.main, focusModeEnabled],
  );
  const panelFrames = useMemo(
    () => ({
      left: insetToolWindowFrame(geometry.frames.left),
      right: insetToolWindowFrame(geometry.frames.right),
      bottom: insetToolWindowFrame(geometry.frames.bottom),
    }),
    [geometry.frames],
  );
  const terminalHeader = useMemo(() => {
    const selectedTerminal =
      terminalTabs.find((tab) => tab.tabId === tools.selectedTerminalTabId) ?? terminalTabs[0];
    const terminalRegion = selectedTerminal
      ? tools.regionByTabId[selectedTerminal.tabId]
      : "bottom";
    if (!selectedTerminal) return null;
    return (
      <TerminalToolWindowTabs
        workspaceKey={workspaceKey}
        serverId={serverId}
        workspaceId={workspaceId}
        paneId={pane?.id ?? "explorer"}
        region={terminalRegion}
        tabs={terminalTabs}
        activeTabId={selectedTerminal.tabId}
        onFocusTool={setFocusedToolTabId}
        buildTabMenu={buildTabMenu}
      />
    );
  }, [
    terminalTabs,
    tools.selectedTerminalTabId,
    tools.regionByTabId,
    workspaceKey,
    serverId,
    workspaceId,
    pane?.id,
    buildTabMenu,
  ]);
  const terminalWindow = useMemo(() => {
    const selectedTerminal =
      terminalTabs.find((tab) => tab.tabId === tools.selectedTerminalTabId) ?? terminalTabs[0];
    const terminalRegion = selectedTerminal
      ? tools.regionByTabId[selectedTerminal.tabId]
      : "bottom";
    if (!selectedTerminal) return null;
    return (
      <ToolWindowPanel
        workspaceKey={workspaceKey}
        serverId={serverId}
        workspaceId={workspaceId}
        paneId={pane?.id ?? "explorer"}
        tab={selectedTerminal}
        region={terminalRegion}
        frame={panelFrames[terminalRegion]}
        visible={visibleTabIds.has(selectedTerminal.tabId)}
        onFocusTool={setFocusedToolTabId}
        menuEntries={buildTabMenu({ tab: selectedTerminal, tabs: terminalTabs })}
        headerContent={terminalHeader}
      >
        <WorkspacePanelHost
          paneId={pane?.id ?? "explorer"}
          tabs={terminalTabs}
          activeTabId={selectedTerminal.tabId}
          visibleTabIds={visibleTabIds}
          retentionLimit={terminalTabs.length}
          normalizedServerId={serverId}
          normalizedWorkspaceId={workspaceId}
          isWorkspaceFocused={isWorkspaceFocused}
          isPaneFocused={paneState.activeTabId === selectedTerminal.tabId}
          buildPaneContentModel={buildPaneContentModel}
        />
      </ToolWindowPanel>
    );
  }, [
    paneState.activeTabId,
    terminalHeader,
    terminalTabs,
    tools.selectedTerminalTabId,
    tools.regionByTabId,
    workspaceKey,
    serverId,
    workspaceId,
    pane?.id,
    panelFrames,
    visibleTabIds,
    buildTabMenu,
    isWorkspaceFocused,
    buildPaneContentModel,
  ]);
  const renderPanel = useCallback(
    (tab: WorkspaceTabDescriptor, content: ReactNode) => {
      const region = tools.regionByTabId[tab.tabId];
      return (
        <ToolWindowPanel
          key={tab.tabId}
          workspaceKey={workspaceKey}
          serverId={serverId}
          workspaceId={workspaceId}
          paneId={pane?.id ?? "explorer"}
          tab={tab}
          region={region}
          frame={panelFrames[region]}
          visible={visibleTabIds.has(tab.tabId)}
          onFocusTool={setFocusedToolTabId}
          menuEntries={buildTabMenu({ tab, tabs: byRegion[region] })}
        >
          {content}
        </ToolWindowPanel>
      );
    },
    [
      tools.regionByTabId,
      workspaceKey,
      serverId,
      workspaceId,
      pane?.id,
      panelFrames,
      visibleTabIds,
      buildTabMenu,
      byRegion,
    ],
  );
  return (
    <View style={styles.workspace} onLayout={measure} testID="workspace-tool-windows">
      <View style={mainStyle} onPointerDown={focusMain}>
        {children}
      </View>
      {!focusModeEnabled ? (
        <>
          <View style={styles.leftRail}>
            <ToolWindowRailGroup
              workspaceKey={workspaceKey}
              serverId={serverId}
              workspaceId={workspaceId}
              paneId={pane?.id ?? "explorer"}
              region="left"
              tabs={byRegion.left}
              allTabs={tabs}
              selectedTerminalTabId={tools.selectedTerminalTabId}
              focusedTabId={focusedToolTabId}
              onFocusTool={setFocusedToolTabId}
              activeTabId={tools.activeByRegion.left}
            />
            <ToolWindowRailGroup
              workspaceKey={workspaceKey}
              serverId={serverId}
              workspaceId={workspaceId}
              paneId={pane?.id ?? "explorer"}
              region="bottom"
              tabs={byRegion.bottom}
              allTabs={tabs}
              selectedTerminalTabId={tools.selectedTerminalTabId}
              focusedTabId={focusedToolTabId}
              onFocusTool={setFocusedToolTabId}
              activeTabId={tools.activeByRegion.bottom}
            />
          </View>
          <View style={styles.rightRail}>
            <ToolWindowRailGroup
              workspaceKey={workspaceKey}
              serverId={serverId}
              workspaceId={workspaceId}
              paneId={pane?.id ?? "explorer"}
              region="right"
              tabs={byRegion.right}
              allTabs={tabs}
              selectedTerminalTabId={tools.selectedTerminalTabId}
              focusedTabId={focusedToolTabId}
              onFocusTool={setFocusedToolTabId}
              activeTabId={tools.activeByRegion.right}
            />
          </View>
        </>
      ) : null}
      <View style={panelsStyle} pointerEvents="box-none" testID="workspace-explorer-sidebar">
        <WorkspacePanelHost
          paneId={pane?.id ?? "explorer"}
          tabs={otherTabs}
          activeTabId={paneState.activeTabId}
          visibleTabIds={visibleTabIds}
          retentionLimit={tabs.length + 3}
          renderPanel={renderPanel}
          normalizedServerId={serverId}
          normalizedWorkspaceId={workspaceId}
          isWorkspaceFocused={isWorkspaceFocused}
          isPaneFocused
          buildPaneContentModel={buildPaneContentModel}
        />
        {terminalWindow}
      </View>
      {!focusModeEnabled &&
        TOOL_WINDOW_REGIONS.map((region) =>
          visibleTabIds.has(tools.activeByRegion[region] ?? "") ? (
            <ToolWindowResize
              key={region}
              workspaceKey={workspaceKey}
              region={region}
              frame={geometry.frames[region]}
              width={bounds.width}
              height={bounds.height}
              onPreview={preview}
            />
          ) : null,
        )}
    </View>
  );
}
const styles = StyleSheet.create((theme) => ({
  workspace: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    position: "relative",
    backgroundColor: theme.colors.surfaceShell,
  },
  main: { position: "absolute", minWidth: 0, minHeight: 0, backgroundColor: theme.colors.surface0 },
  framedMain: {
    borderRadius: theme.borderRadius.xl,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  panels: { position: "absolute", left: 0, top: 0, right: 0, bottom: 0 },
  leftRail: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: TOOL_WINDOW_RAIL_WIDTH + TOOL_WINDOW_PANEL_INSET,
    backgroundColor: theme.colors.surfaceShell,
  },
  rightRail: {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: TOOL_WINDOW_RAIL_WIDTH + TOOL_WINDOW_PANEL_INSET,
    backgroundColor: theme.colors.surfaceShell,
  },
  hidden: { display: "none" },
  resize: { position: "absolute", zIndex: 5, flexDirection: "row" },
}));
