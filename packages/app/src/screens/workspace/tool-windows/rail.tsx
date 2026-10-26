import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ScrollView, View } from "react-native";
import { useDndContext, useDraggable, useDroppable } from "@dnd-kit/core";
import { StyleSheet } from "react-native-unistyles";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import {
  WorkspaceTabPresentationResolver,
  WorkspaceTabIcon,
  type WorkspaceTabPresentation,
} from "@/screens/workspace/workspace-tab-presentation";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import type { ToolWindowRegion } from "@/workspace-tabs/tool-windows/model";
import { useToolWindowNodeRef } from "./dnd";
import { ToolWindowAddMenu } from "./add-menu";

interface RailProps {
  workspaceKey: string;
  serverId: string;
  workspaceId: string;
  paneId: string;
  region: ToolWindowRegion;
  tabs: WorkspaceTabDescriptor[];
  allTabs: WorkspaceTabDescriptor[];
  activeTabId: string | null;
  focusedTabId: string | null;
  selectedTerminalTabId?: string | null;
  onFocusTool: (tabId: string) => void;
}
function ToolWindowIcon({
  tab,
  selected,
  ...props
}: Omit<RailProps, "tabs" | "allTabs" | "activeTabId"> & {
  tab: WorkspaceTabDescriptor;
  selected: boolean;
}) {
  const { onFocusTool } = props;
  const { t } = useTranslation();
  const focused = selected && props.focusedTabId === tab.tabId;
  const toggle = useWorkspaceLayoutStore((state) => state.toggleToolWindow);
  const data = useMemo(
    () => ({ kind: "workspace-tab", paneId: props.paneId, tabId: tab.tabId }),
    [props.paneId, tab.tabId],
  );
  const {
    listeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({ id: `tool-window-icon:${tab.tabId}`, data });
  const dropData = useMemo(
    () => ({ kind: "tool-window-region", region: props.region, beforeTabId: tab.tabId }),
    [props.region, tab.tabId],
  );
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `tool-window-entry:${tab.tabId}`,
    data: dropData,
  });
  const ref = useToolWindowNodeRef(setDragRef, setDropRef);
  const select = useCallback(() => {
    if (!isDragging) {
      onFocusTool(tab.tabId);
      toggle(props.workspaceKey, tab.tabId);
    }
  }, [isDragging, toggle, props.workspaceKey, onFocusTool, tab.tabId]);
  const dataSet = useMemo(() => {
    let state = selected ? "open" : "closed";
    if (focused) state = "active";
    return { state };
  }, [focused, selected]);
  const renderIcon = useCallback(
    (presentation: WorkspaceTabPresentation) => (
      <ToolbarButton
        label={
          tab.target.kind === "terminal"
            ? t("workspace.tabs.fallback.terminal")
            : presentation.label
        }
        selected={selected || isOver}
        selectedTone={focused ? "blue" : "neutral"}
        dataSet={dataSet}
        aria-pressed={selected}
        tooltipSide={props.region === "right" ? "left" : "right"}
        onPress={select}
        testID={`tool-window-icon-${tab.tabId}`}
        style={styles.icon}
      >
        <WorkspaceTabIcon
          presentation={presentation}
          active={selected}
          color={focused ? styles.activeGlyph.color : undefined}
          size={18}
          backdrop="surfaceSidebar"
        />
      </ToolbarButton>
    ),
    [selected, focused, dataSet, isOver, props.region, select, tab.tabId, tab.target.kind, t],
  );
  return (
    <View ref={ref} {...listeners}>
      <WorkspaceTabPresentationResolver
        tab={tab}
        serverId={props.serverId}
        workspaceId={props.workspaceId}
      >
        {renderIcon}
      </WorkspaceTabPresentationResolver>
    </View>
  );
}
export function ToolWindowRailGroup(props: RailProps) {
  const { active } = useDndContext();
  const data = useMemo(
    () => ({ kind: "tool-window-region", region: props.region, beforeTabId: null }),
    [props.region],
  );
  const { setNodeRef, isOver } = useDroppable({ id: `tool-window-region:${props.region}`, data });
  const ref = useToolWindowNodeRef(setNodeRef);
  const targets = useMemo(() => props.allTabs.map((tab) => tab.target), [props.allTabs]);
  const style = useMemo(
    () => [
      styles.group,
      props.region === "bottom" && styles.bottom,
      props.region === "bottom" && active !== null && styles.dragDivider,
      isOver && styles.over,
    ],
    [props.region, isOver, active],
  );
  const railTabs = useMemo(() => {
    const selectedTerminal =
      props.tabs.find((tab) => tab.tabId === props.selectedTerminalTabId) ??
      props.tabs.find((tab) => tab.target.kind === "terminal");
    return props.tabs.filter(
      (tab) => tab.target.kind !== "terminal" || tab.tabId === selectedTerminal?.tabId,
    );
  }, [props.tabs, props.selectedTerminalTabId]);
  return (
    <View ref={ref} style={style} testID={`tool-window-rail-${props.region}`}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={props.region === "bottom" ? styles.bottomContent : styles.topContent}
        showsVerticalScrollIndicator={false}
      >
        {railTabs.map((tab) => (
          <ToolWindowIcon
            key={tab.tabId}
            tab={tab}
            selected={props.activeTabId === tab.tabId}
            focusedTabId={props.focusedTabId}
            onFocusTool={props.onFocusTool}
            workspaceKey={props.workspaceKey}
            serverId={props.serverId}
            workspaceId={props.workspaceId}
            paneId={props.paneId}
            region={props.region}
          />
        ))}
        <ToolWindowAddMenu
          workspaceKey={props.workspaceKey}
          serverId={props.serverId}
          region={props.region}
          targets={targets}
        />
      </ScrollView>
    </View>
  );
}
const styles = StyleSheet.create((theme) => ({
  group: { flex: 1, minHeight: 44, alignItems: "center", paddingVertical: theme.spacing[1] },
  bottom: {
    justifyContent: "flex-end",
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: "transparent",
  },
  dragDivider: { borderTopColor: theme.colors.border },
  scroll: { flex: 1, width: "100%" },
  topContent: { alignItems: "center", gap: theme.spacing[1] },
  bottomContent: {
    flexGrow: 1,
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing[1],
  },
  over: { backgroundColor: theme.colors.interactionHighlight },
  icon: { width: 32, height: 32, borderRadius: theme.borderRadius.md },
  activeGlyph: { color: theme.colors.palette.white },
}));
