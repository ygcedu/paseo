import { isWeb, isNative } from "@/constants/platform";
import { useIsCompactFormFactor } from "@/constants/layout";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useMiddleClickClose } from "@/hooks/use-middle-click-close";
import { useCallback, useMemo, useState, useRef, useEffect } from "react";
import {
  ScrollView,
  Text,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from "react-native";
import { Plus, X, ChevronDown } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import type { WorkspaceTabMenuEntry } from "@/screens/workspace/workspace-tab-menu";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import {
  WorkspaceTabPresentationResolver,
  WorkspaceTabIcon,
  type WorkspaceTabPresentation,
} from "@/screens/workspace/workspace-tab-presentation";
import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { useWorkspaceTabLaunchCatalog } from "@/workspace-tabs/launcher";
import { buildDeterministicWorkspaceTabId } from "@/workspace-tabs/identity";
import type { ToolWindowRegion } from "@/workspace-tabs/tool-windows/model";
import type { Theme } from "@/styles/theme";
import { TerminalTabTrack } from "./terminal-tab-track";
import type { ToolWindowMenuBuilder } from "./actions";

const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedPlus = withUnistyles(Plus);
const ThemedX = withUnistyles(X);
const muted = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const closeColor = (theme: Theme) => ({ color: theme.colors.tabCloseForeground });

interface TerminalTabsProps {
  workspaceKey: string;
  serverId: string;
  workspaceId: string;
  paneId: string;
  region: ToolWindowRegion;
  tabs: WorkspaceTabDescriptor[];
  activeTabId: string;
  onFocusTool: (tabId: string) => void;
  buildTabMenu: ToolWindowMenuBuilder;
  onTabLayout?: (id: string, event: LayoutChangeEvent) => void;
}

function TerminalSessionTab({
  tab,
  active,
  ...props
}: TerminalTabsProps & { tab: WorkspaceTabDescriptor; active: boolean }) {
  const { t } = useTranslation();
  const { onFocusTool, workspaceKey, paneId, buildTabMenu, tabs, onTabLayout } = props;
  const accessibilityState = useMemo(() => ({ selected: active }), [active]);
  const selectTab = useWorkspaceLayoutStore((state) => state.selectTabInPane);
  const select = useCallback(() => {
    onFocusTool(tab.tabId);
    selectTab(workspaceKey, paneId, tab.tabId);
  }, [onFocusTool, workspaceKey, paneId, selectTab, tab.tabId]);
  const close = useCallback(() => {
    const entry = buildTabMenu({ tab, tabs }).find((item) => item.key === "close");
    if (entry?.kind === "item" && !entry.disabled) entry.onSelect();
  }, [buildTabMenu, tabs, tab]);
  const measure = useCallback(
    (event: LayoutChangeEvent) => onTabLayout?.(tab.tabId, event),
    [onTabLayout, tab.tabId],
  );
  const middleClickRef = useMiddleClickClose(close);
  const [hovered, setHovered] = useState(false);
  const [keyboardFocus, setKeyboardFocus] = useState(false);
  const compact = useIsCompactFormFactor();
  useEffect(() => {
    if (!isWeb) return;
    const node = middleClickRef.current as unknown as HTMLElement | null;
    if (!node) return;
    const enter = () => setHovered(true);
    const leave = () => setHovered(false);
    const focus = (event: FocusEvent) =>
      setKeyboardFocus(
        event.target instanceof HTMLElement && event.target.matches(":focus-visible"),
      );
    const blur = (event: FocusEvent) => {
      if (!node.contains(event.relatedTarget as Node | null)) setKeyboardFocus(false);
    };
    node.addEventListener("mouseenter", enter);
    node.addEventListener("mouseleave", leave);
    node.addEventListener("focusin", focus);
    node.addEventListener("focusout", blur);
    return () => {
      node.removeEventListener("mouseenter", enter);
      node.removeEventListener("mouseleave", leave);
      node.removeEventListener("focusin", focus);
      node.removeEventListener("focusout", blur);
    };
  }, [middleClickRef]);
  const showClose = hovered || keyboardFocus || isNative || compact;
  const entries = useMemo(() => buildTabMenu({ tab, tabs }), [buildTabMenu, tab, tabs]);
  const renderLabel = useCallback(
    (presentation: WorkspaceTabPresentation) => (
      <ContextMenu>
        <View
          ref={middleClickRef}
          onLayout={measure}
          style={[styles.tab, hovered && !active && styles.hoveredTab, active && styles.activeTab]}
        >
          <ContextMenuTrigger
            accessibilityRole="tab"
            accessibilityState={accessibilityState}
            aria-selected={active}
            accessibilityLabel={presentation.label}
            onPress={select}
            style={styles.select}
            testID={`workspace-tab-${buildDeterministicWorkspaceTabId(tab.target)}`}
          >
            <WorkspaceTabIcon
              presentation={presentation}
              active={active}
              size={14}
              backdrop="surfaceSidebar"
            />
            <Text numberOfLines={1} style={[styles.label, active && styles.activeLabel]}>
              {presentation.label}
            </Text>
          </ContextMenuTrigger>
          <View
            style={[styles.closeFrame, !showClose && styles.addHidden]}
            pointerEvents={showClose ? "auto" : "none"}
            testID={`terminal-session-close-frame-${tab.tabId}`}
          >
            <ToolbarButton
              label={`${t("workspace.tabs.menu.close")} ${presentation.label}`}
              onPress={close}
              testID={`terminal-session-close-${tab.tabId}`}
              round
              hoverStyle={styles.closeHovered}
            >
              <ThemedX size={13} uniProps={closeColor} />
            </ToolbarButton>
          </View>
        </View>
        <ContextMenuContent align="start" minWidth={220}>
          {entries.map((entry) => (
            <SessionMenuItem key={entry.key} entry={entry} />
          ))}
        </ContextMenuContent>
      </ContextMenu>
    ),
    [
      entries,
      hovered,
      showClose,
      active,
      accessibilityState,
      select,
      close,
      middleClickRef,
      measure,
      tab.tabId,
      tab.target,
      t,
    ],
  );
  return (
    <WorkspaceTabPresentationResolver
      tab={tab}
      serverId={props.serverId}
      workspaceId={props.workspaceId}
    >
      {renderLabel}
    </WorkspaceTabPresentationResolver>
  );
}

function SessionMenuItem({ entry }: { entry: WorkspaceTabMenuEntry }) {
  if (entry.kind === "separator") return <ContextMenuSeparator />;
  if (entry.kind === "file-panel-open-with") return null;
  return (
    <ContextMenuItem
      testID={entry.testID}
      disabled={entry.disabled}
      destructive={entry.destructive}
      onSelect={entry.onSelect}
    >
      {entry.label}
    </ContextMenuItem>
  );
}

function OverflowMenuRow({
  presentation,
  tabId,
  active,
  onSelect,
}: {
  presentation: WorkspaceTabPresentation;
  tabId: string;
  active: boolean;
  onSelect: () => void;
}) {
  const leading = useMemo(
    () => (
      <WorkspaceTabIcon
        presentation={presentation}
        active={active}
        size={14}
        backdrop="surfaceSidebar"
      />
    ),
    [presentation, active],
  );
  return (
    <DropdownMenuItem
      selected={active}
      showSelectedCheck
      testID={`terminal-overflow-${tabId}`}
      onSelect={onSelect}
      leading={leading}
    >
      {presentation.label}
    </DropdownMenuItem>
  );
}

function TerminalOverflowItem({
  tab,
  ...props
}: TerminalTabsProps & { tab: WorkspaceTabDescriptor }) {
  const { onFocusTool, workspaceKey, paneId, activeTabId } = props;
  const selectTab = useWorkspaceLayoutStore((state) => state.selectTabInPane);
  const select = useCallback(() => {
    onFocusTool(tab.tabId);
    selectTab(workspaceKey, paneId, tab.tabId);
  }, [onFocusTool, workspaceKey, paneId, selectTab, tab.tabId]);
  const label = useCallback(
    (presentation: WorkspaceTabPresentation) => (
      <OverflowMenuRow
        presentation={presentation}
        tabId={tab.tabId}
        active={tab.tabId === activeTabId}
        onSelect={select}
      />
    ),
    [activeTabId, tab.tabId, select],
  );
  return (
    <WorkspaceTabPresentationResolver
      tab={tab}
      serverId={props.serverId}
      workspaceId={props.workspaceId}
    >
      {label}
    </WorkspaceTabPresentationResolver>
  );
}

export function TerminalToolWindowTabs(props: TerminalTabsProps) {
  const { t } = useTranslation();
  const scroll = useRef<ScrollView>(null);
  const positions = useRef(new Map<string, { x: number; width: number }>());
  const scrollOffset = useRef(0);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [contentWidth, setContentWidth] = useState(0);
  const [layoutRevision, setLayoutRevision] = useState(0);
  const measureTab = useCallback((id: string, event: LayoutChangeEvent) => {
    const { x, width } = event.nativeEvent.layout;
    const previous = positions.current.get(id);
    if (previous?.x === x && previous.width === width) return;
    positions.current.set(id, { x, width });
    setLayoutRevision((value) => value + 1);
  }, []);
  const measureViewport = useCallback(
    (event: LayoutChangeEvent) => setViewportWidth(event.nativeEvent.layout.width),
    [],
  );
  useEffect(() => {
    const position = positions.current.get(props.activeTabId);
    if (!position || !viewportWidth) return;
    const offset = scrollOffset.current;
    let x = offset;
    if (position.x < offset) x = position.x;
    else if (position.x + position.width > offset + viewportWidth)
      x = position.x + position.width - viewportWidth;
    if (x !== offset) scroll.current?.scrollTo({ x, animated: false });
  }, [props.activeTabId, viewportWidth, layoutRevision]);
  const recordScroll = useCallback((event: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollOffset.current = event.nativeEvent.contentOffset.x;
  }, []);
  const overflow = contentWidth > viewportWidth + 2;
  const catalog = useWorkspaceTabLaunchCatalog({
    serverId: props.serverId,
    host: "explorer",
    purpose: "supporting",
    surface: "menu",
    allowTerminalSessions: true,
  });
  const items = useMemo(
    () => catalog.flatMap((group) => group.items).filter((item) => item.panelKind === "terminal"),
    [catalog],
  );
  const defaultItem = items.find((item) => item.id === "terminal");
  const create = useCallback(
    () =>
      defaultItem?.launch({ kind: "open", paneId: props.paneId, toolWindowRegion: props.region }),
    [defaultItem, props.paneId, props.region],
  );
  const renderAdd = useCallback(
    (showAdd: boolean) => (
      <View
        style={[styles.add, !showAdd && styles.addHidden]}
        pointerEvents={showAdd ? "auto" : "none"}
        testID="terminal-session-new-frame"
      >
        <ToolbarButton
          label={defaultItem?.label ?? t("workspace.tabs.fallback.terminal")}
          onPress={create}
          disabled={!defaultItem || defaultItem.disabled}
          testID="terminal-session-new"
        >
          <ThemedPlus size={16} uniProps={muted} />
        </ToolbarButton>
      </View>
    ),
    [defaultItem, create, t],
  );
  const renderTrack = useCallback(
    (showAdd: boolean) => (
      <ScrollView
        ref={scroll}
        horizontal
        onLayout={measureViewport}
        onContentSizeChange={setContentWidth}
        onScroll={recordScroll}
        scrollEventThrottle={16}
        showsHorizontalScrollIndicator={false}
        style={styles.scroll}
        contentContainerStyle={styles.track}
      >
        {props.tabs.map((tab) => (
          <TerminalSessionTab
            key={tab.tabId}
            {...props}
            tab={tab}
            onTabLayout={measureTab}
            active={tab.tabId === props.activeTabId}
          />
        ))}
        {!overflow && renderAdd(showAdd)}
      </ScrollView>
    ),
    [props, overflow, renderAdd, measureTab, measureViewport, recordScroll],
  );
  return (
    <View style={styles.container}>
      <TerminalTabTrack>{renderTrack}</TerminalTabTrack>
      {overflow && renderAdd(true)}
      {overflow ? (
        <View style={styles.overflowFrame}>
          <DropdownMenu>
            <ToolbarButton
              kind="menu"
              label={t("workspace.tabs.toolWindows.allTerminals")}
              testID="terminal-session-overflow"
              style={styles.overflow}
            >
              <ThemedChevronDown size={16} uniProps={muted} />
            </ToolbarButton>
            <DropdownMenuContent align="end" minWidth={240} testID="terminal-session-overflow-menu">
              {props.tabs.map((tab) => (
                <TerminalOverflowItem key={tab.tabId} {...props} tab={tab} />
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
  },
  scroll: { flex: 1, minWidth: 0 },
  add: {
    width: 22,
    flexShrink: 0,
    alignSelf: "stretch",
    justifyContent: "center",
    alignItems: "center",
  },
  closeFrame: { width: 20, height: 20, flexShrink: 0 },
  closeHovered: { backgroundColor: theme.colors.tabCloseHoverBackground },
  hoveredTab: { backgroundColor: theme.colors.tabHoverBackground },
  addHidden: { opacity: 0 },
  overflowFrame: { width: 24, flexShrink: 0, alignSelf: "stretch", justifyContent: "center" },
  overflow: { width: 24, height: 32, borderLeftWidth: 1, borderLeftColor: theme.colors.border },
  track: { flexDirection: "row", alignItems: "center", paddingHorizontal: theme.spacing[1] },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    height: 30,
    marginHorizontal: 3,
    marginVertical: 3,
    paddingRight: 3,
    borderWidth: 1,
    borderColor: "transparent",
    borderRadius: theme.borderRadius.md,
    flexShrink: 0,
  },
  activeTab: {
    backgroundColor: theme.colors.tabSelectedBackground,
    borderColor: theme.colors.tabSelectedBorder,
  },
  select: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    justifyContent: "center",
    alignSelf: "stretch",
    paddingHorizontal: theme.spacing[2],
    maxWidth: 180,
  },
  label: { fontSize: theme.fontSize.base, color: theme.colors.foregroundMuted },
  activeLabel: { color: theme.colors.tabSelectedForeground },
}));
