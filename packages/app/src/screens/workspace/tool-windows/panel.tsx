import { useFilePanelOpenWithMenu } from "@/file-panels";
import { WORKSPACE_SECONDARY_HEADER_HEIGHT } from "@/constants/layout";
import type { WorkspaceTabMenuEntry } from "@/screens/workspace/workspace-tab-menu";
import { useCallback, useMemo, type ReactNode } from "react";
import { Text, View } from "react-native";
import { Ellipsis, Minus } from "lucide-react-native";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { RetainedPanel } from "@/components/retained-panel";
import { ToolbarButton, ToolbarControls } from "@/components/ui/pane-content-toolbar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  WorkspaceTabPresentationResolver,
  type WorkspaceTabPresentation,
} from "@/screens/workspace/workspace-tab-presentation";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import type { Theme } from "@/styles/theme";
import { TOOL_WINDOW_REGIONS, type ToolWindowRegion } from "@/workspace-tabs/tool-windows/model";
import type { ToolWindowFrame } from "@/workspace-tabs/tool-windows/geometry";
import { useToolWindowNodeRef } from "./dnd";

const ThemedMinus = withUnistyles(Minus);
const ThemedEllipsis = withUnistyles(Ellipsis);
const muted = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
interface ToolWindowPanelProps {
  workspaceKey: string;
  serverId: string;
  workspaceId: string;
  paneId: string;
  tab: WorkspaceTabDescriptor;
  region: ToolWindowRegion;
  frame: ToolWindowFrame;
  visible: boolean;
  onFocusTool: (tabId: string) => void;
  menuEntries: WorkspaceTabMenuEntry[];
  children: ReactNode;
  headerContent?: ReactNode;
}
function MoveItem({
  workspaceKey,
  tabId,
  region,
}: {
  workspaceKey: string;
  tabId: string;
  region: ToolWindowRegion;
}) {
  const { t } = useTranslation();
  const move = useWorkspaceLayoutStore((state) => state.moveToolWindow);
  const select = useCallback(
    () => move(workspaceKey, { tabId, region, beforeTabId: null }),
    [move, workspaceKey, tabId, region],
  );
  return (
    <DropdownMenuItem onSelect={select}>
      {t(`workspace.tabs.toolWindows.move.${region}`)}
    </DropdownMenuItem>
  );
}
function ToolWindowMenuEntry({
  entry,
  terminal,
  openWithTrigger,
}: {
  entry: WorkspaceTabMenuEntry;
  terminal: boolean;
  openWithTrigger: ReactNode;
}) {
  const { t } = useTranslation();
  if (entry.kind === "separator") return <DropdownMenuSeparator />;
  if (entry.kind === "file-panel-open-with") return openWithTrigger;
  const label =
    entry.key === "close" && !terminal ? t("workspace.tabs.toolWindows.remove") : entry.label;
  return (
    <DropdownMenuItem
      disabled={entry.disabled}
      destructive={entry.destructive}
      onSelect={entry.onSelect}
      testID={entry.testID}
    >
      {label}
    </DropdownMenuItem>
  );
}

export function ToolWindowPanel({
  workspaceKey,
  serverId,
  workspaceId,
  paneId,
  tab,
  region,
  frame,
  visible,
  onFocusTool,
  menuEntries,
  children,
  headerContent,
}: ToolWindowPanelProps) {
  const { t } = useTranslation();
  const openWith = useFilePanelOpenWithMenu(
    { serverId, workspaceId, tabId: tab.tabId },
    `tool-window-context-${tab.tabId}`,
  );
  const selectTab = useWorkspaceLayoutStore((state) => state.selectTabInPane);
  const focus = useCallback(() => {
    onFocusTool(tab.tabId);
    selectTab(workspaceKey, paneId, tab.tabId);
  }, [selectTab, workspaceKey, paneId, tab.tabId, onFocusTool]);
  const minimize = useWorkspaceLayoutStore((state) => state.minimizeToolWindow);
  const hide = useCallback(() => minimize(workspaceKey, region), [minimize, workspaceKey, region]);
  const data = useMemo(
    () => ({ kind: "workspace-tab", paneId, tabId: tab.tabId }),
    [paneId, tab.tabId],
  );
  const { attributes, listeners, setNodeRef } = useDraggable({
    id: `tool-window-title:${tab.tabId}`,
    data,
  });
  const dropData = useMemo(
    () => ({ kind: "tool-window-region", region, beforeTabId: tab.tabId }),
    [region, tab.tabId],
  );
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `tool-window-panel:${tab.tabId}`,
    data: dropData,
    disabled: !visible,
  });
  const dropRef = useToolWindowNodeRef(setDropRef);
  const ref = useToolWindowNodeRef(setNodeRef);
  const frameStyle = useMemo(() => [styles.frame, frame], [frame]);
  const dataSet = useMemo(() => ({ region }), [region]);
  const renderTitle = useCallback(
    (presentation: WorkspaceTabPresentation) => (
      <Text numberOfLines={1} style={styles.title}>
        {tab.target.kind === "terminal"
          ? t("workspace.tabs.fallback.terminal")
          : presentation.label}
      </Text>
    ),
    [tab.target.kind, t],
  );
  return (
    <RetainedPanel active={visible} style={frameStyle} testID={`tool-window-panel-${tab.tabId}`}>
      <View ref={dropRef} style={styles.inner} dataSet={dataSet} onPointerDown={focus}>
        <View style={styles.header}>
          <View
            ref={ref}
            style={[
              styles.dragTitle,
              Boolean(headerContent) && styles.groupTitle,
              Boolean(headerContent) && frame.width < 220 && styles.hiddenControl,
            ]}
            {...attributes}
            {...listeners}
            role="button"
            tabIndex={0}
            testID={`tool-window-drag-${tab.tabId}`}
          >
            <WorkspaceTabPresentationResolver
              tab={tab}
              serverId={serverId}
              workspaceId={workspaceId}
            >
              {renderTitle}
            </WorkspaceTabPresentationResolver>
          </View>
          {headerContent}
          <ToolbarControls style={styles.controls}>
            <DropdownMenu>
              <ToolbarButton
                kind="menu"
                style={headerContent && frame.width < 120 ? styles.hiddenControl : undefined}
                label={t("workspace.tabs.toolWindows.configure")}
                testID={`tool-window-configure-${tab.tabId}`}
              >
                <ThemedEllipsis size={14} uniProps={muted} />
              </ToolbarButton>
              <DropdownMenuContent side="bottom" align="end" minWidth={220} pages={openWith.pages}>
                {TOOL_WINDOW_REGIONS.filter((value) => value !== region).map((value) => (
                  <MoveItem
                    key={value}
                    workspaceKey={workspaceKey}
                    tabId={tab.tabId}
                    region={value}
                  />
                ))}
                <DropdownMenuSeparator />
                {menuEntries.map((entry) => (
                  <ToolWindowMenuEntry
                    key={entry.key}
                    entry={entry}
                    openWithTrigger={openWith.trigger}
                    terminal={tab.target.kind === "terminal"}
                  />
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <ToolbarButton
              label={t("workspace.tabs.toolWindows.minimize")}
              onPress={hide}
              testID={`tool-window-minimize-${region}`}
            >
              <ThemedMinus size={16} uniProps={muted} />
            </ToolbarButton>
          </ToolbarControls>
        </View>
        <View style={styles.content}>{children}</View>
        {isOver ? <View pointerEvents="none" style={styles.dropOverlay} /> : null}
      </View>
    </RetainedPanel>
  );
}
const styles = StyleSheet.create((theme) => ({
  frame: {
    position: "absolute",
    minWidth: 0,
    minHeight: 0,
    overflow: "hidden",
    backgroundColor: theme.colors.surfaceSidebar,
    borderRadius: theme.borderRadius.xl,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  inner: { flex: 1, minWidth: 0, minHeight: 0 },
  dropOverlay: {
    position: "absolute",
    left: 0,
    top: 0,
    right: 0,
    bottom: 0,
    borderWidth: 2,
    borderColor: theme.colors.accent,
    backgroundColor: theme.colors.interactionHighlight,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    height: WORKSPACE_SECONDARY_HEADER_HEIGHT,
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
    paddingRight: theme.spacing[1],
  },
  dragTitle: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    paddingHorizontal: theme.spacing[3],
    justifyContent: "center",
    alignSelf: "stretch",
  },
  groupTitle: { flexGrow: 0, flexShrink: 0, flexBasis: "auto" },
  hiddenControl: { display: "none" },
  controls: { gap: theme.spacing[1], flexShrink: 0 },
  title: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
  },
  content: { flex: 1, minWidth: 0, minHeight: 0 },
}));
