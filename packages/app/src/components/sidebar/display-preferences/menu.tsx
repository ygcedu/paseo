import { useCallback, useMemo, type ReactElement } from "react";
import { Text, View, type PressableStateCallbackType } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  Settings2,
  Layers,
  Type,
  GitBranch,
  Folder,
  Server,
  GitPullRequest,
  Globe,
  Tag,
  CircleCheck,
  CircleDashed,
  Captions,
  Diff,
  Clock,
  PanelRight,
  EyeOff,
  type LucideIcon,
} from "lucide-react-native";
import { MenuLabel, MenuRoot, MenuSeparator, MenuSurface, MenuTrigger } from "@/components/ui/menu";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { DensityIcon } from "@/components/ui/density-icon";
import { Switch } from "@/components/ui/switch";
import { isWeb } from "@/constants/platform";
import type { Theme } from "@/styles/theme";
import { useSidebarModel } from "../sidebar-model";
import { useSidebarDisplayPreferences } from "./model";
import { SIDEBAR_ROW_ITEMS, type SidebarRowItem } from "./row-items";

const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedSettings2 = withUnistyles(Settings2);
const ROW_ITEM_LABEL_KEYS: Record<SidebarRowItem, string> = {
  branch: "sidebar.display.show.branch",
  project: "sidebar.display.show.project",
  host: "sidebar.display.show.host",
  changeRequest: "sidebar.display.show.changeRequest",
  services: "sidebar.display.show.services",
  labels: "sidebar.display.show.labels",
};

const ROW_ITEM_ICONS: Record<SidebarRowItem, LucideIcon> = {
  branch: GitBranch,
  project: Folder,
  host: Server,
  changeRequest: GitPullRequest,
  services: Globe,
  labels: Tag,
};

function optionIcon(Icon: LucideIcon) {
  return function OptionIcon({ color, size }: { color: string; size: number }) {
    return <Icon color={color} size={size} />;
  };
}

const OPTION_ICONS = {
  project: optionIcon(Folder),
  status: optionIcon(CircleDashed),
  title: optionIcon(Type),
  branch: optionIcon(GitBranch),
  iconAndText: optionIcon(Captions),
  icon: optionIcon(CircleCheck),
  none: optionIcon(EyeOff),
  diff: optionIcon(Diff),
  timestamp: optionIcon(Clock),
};

export function SidebarDisplayPreferencesMenu(): ReactElement {
  const { t } = useTranslation();
  const preferences = useSidebarDisplayPreferences();
  const { workspaceSortSupported } = useSidebarModel();
  const sortOptions = useMemo(() => {
    const manual = {
      value: "manual" as const,
      label: t("sidebar.display.sort.manual"),
      testID: "sidebar-sort-manual",
    };
    if (!workspaceSortSupported) return [manual];
    return [
      manual,
      {
        value: "created" as const,
        label: t("sidebar.display.sort.created"),
        testID: "sidebar-sort-created",
      },
      {
        value: "lastPrompt" as const,
        label: t("sidebar.display.sort.lastPrompt"),
        testID: "sidebar-sort-lastPrompt",
      },
    ];
  }, [t, workspaceSortSupported]);
  const triggerStyle = useCallback(
    ({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.trigger,
      hovered && styles.triggerHovered,
    ],
    [],
  );
  const groupingOptions = useMemo(
    () => [
      {
        value: "project" as const,
        icon: OPTION_ICONS.project,
        label: t("sidebar.display.grouping.project"),
        testID: "sidebar-grouping-project",
      },
      {
        value: "status" as const,
        icon: OPTION_ICONS.status,
        label: t("sidebar.display.grouping.status"),
        testID: "sidebar-grouping-status",
      },
    ],
    [t],
  );
  const titleOptions = useMemo(
    () => [
      {
        value: "title" as const,
        icon: OPTION_ICONS.title,
        label: t("sidebar.display.titleSource.title"),
        testID: "sidebar-workspace-title-source-title",
      },
      {
        value: "branch" as const,
        icon: OPTION_ICONS.branch,
        label: t("sidebar.display.titleSource.branch"),
        testID: "sidebar-workspace-title-source-branch",
      },
    ],
    [t],
  );
  const checksOptions = useMemo(
    () => [
      {
        value: "iconAndText" as const,
        icon: OPTION_ICONS.iconAndText,
        label: t("sidebar.display.checks.iconAndText"),
        testID: "sidebar-checks-display-iconAndText",
      },
      {
        value: "icon" as const,
        icon: OPTION_ICONS.icon,
        label: t("sidebar.display.checks.icon"),
        testID: "sidebar-checks-display-icon",
      },
      {
        value: "none" as const,
        icon: OPTION_ICONS.none,
        label: t("sidebar.display.checks.none"),
        testID: "sidebar-checks-display-none",
      },
    ],
    [t],
  );

  const trailingOptions = useMemo(
    () => [
      {
        value: "none" as const,
        icon: OPTION_ICONS.none,
        label: t("sidebar.display.checks.none"),
        testID: "sidebar-workspace-trailing-none",
      },
      {
        value: "diff" as const,
        icon: OPTION_ICONS.diff,
        label: t("sidebar.display.show.diff"),
        testID: "sidebar-workspace-trailing-diff",
      },
      {
        value: "timestamp" as const,
        icon: OPTION_ICONS.timestamp,
        label: t("sidebar.display.show.timestamp"),
        testID: "sidebar-workspace-trailing-timestamp",
      },
    ],
    [t],
  );
  const setTrailing = useCallback(
    (value: "none" | "diff" | "timestamp") => {
      if (value === preferences.trailing) return;
      if (value === "none") {
        if (preferences.trailing !== "none") preferences.toggleTrailing(preferences.trailing);
      } else preferences.toggleTrailing(value);
    },
    [preferences],
  );

  return (
    <MenuRoot compactMode="sheet">
      <MenuTrigger
        style={triggerStyle}
        accessibilityRole={isWeb ? undefined : "button"}
        accessibilityLabel={t("sidebar.display.trigger")}
        testID="sidebar-display-preferences-menu"
      >
        <ThemedSettings2 size={14} uniProps={mutedIconMapping} />
      </MenuTrigger>
      <MenuSurface
        align="end"
        width={400}
        shadow="popover"
        sheetTitle={t("sidebar.display.heading")}
        testID="sidebar-display-preferences-content"
      >
        <View style={styles.content}>
          <View style={styles.settingRow}>
            <SettingLabel icon={Layers} label={t("sidebar.display.grouping.label")} />
            <SegmentedControl
              joined
              style={styles.segments}
              size="sm"
              textStyle={styles.compactText}
              options={groupingOptions}
              value={preferences.grouping}
              onValueChange={preferences.setGrouping}
              testID="sidebar-display-grouping"
            />
          </View>
          {preferences.grouping === "project" ? (
            <View style={styles.settingRow}>
              <SettingLabel icon={Clock} label={t("sidebar.display.sort.label")} />
              <SegmentedControl
                joined
                style={styles.segments}
                size="sm"
                textStyle={styles.compactText}
                options={sortOptions}
                value={workspaceSortSupported ? preferences.workspaceSort : "manual"}
                onValueChange={preferences.setWorkspaceSort}
                testID="sidebar-display-sort"
              />
            </View>
          ) : null}
          <View style={styles.settingRow}>
            <SettingLabel icon={Type} label={t("sidebar.display.titleSource.label")} />
            <SegmentedControl
              joined
              style={styles.segments}
              size="sm"
              textStyle={styles.compactText}
              options={titleOptions}
              value={preferences.titleSource}
              onValueChange={preferences.setTitleSource}
              testID="sidebar-display-title-source"
            />
          </View>
        </View>
        <MenuSeparator />
        <MenuLabel>
          <Text style={styles.compactText}>{t("sidebar.display.show.label")}</Text>
        </MenuLabel>
        <View style={styles.toggleList} testID="sidebar-display-show">
          {SIDEBAR_ROW_ITEMS.map((item) => (
            <PreferenceToggle
              key={item}
              value={item}
              icon={ROW_ITEM_ICONS[item]}
              label={t(ROW_ITEM_LABEL_KEYS[item])}
              selected={preferences.rowItems[item]}
              onToggle={preferences.toggleRowItem}
              testID={`sidebar-row-item-${item}`}
            />
          ))}
        </View>
        <MenuSeparator />
        <View style={styles.content}>
          <View style={styles.settingRow}>
            <SettingLabel icon={CircleCheck} label={t("sidebar.display.show.checks")} />
            <SegmentedControl
              joined
              style={styles.segments}
              size="sm"
              textStyle={styles.compactText}
              options={checksOptions}
              value={preferences.checksDisplay}
              onValueChange={preferences.setChecksDisplay}
              testID="sidebar-display-checks"
            />
          </View>
          <View style={styles.settingRow}>
            <SettingLabel icon={PanelRight} label={t("sidebar.display.trailing")} />
            <SegmentedControl
              joined
              style={styles.segments}
              size="sm"
              textStyle={styles.compactText}
              options={trailingOptions}
              value={preferences.trailing}
              onValueChange={setTrailing}
              testID="sidebar-display-trailing"
            />
          </View>
        </View>
        <MenuSeparator />
        <View style={styles.backgroundRow}>
          <SettingLabel icon={EyeOff} label={t("sidebar.display.showBackground")} />
          <Switch
            value={preferences.showBackground}
            onValueChange={preferences.toggleBackground}
            accessibilityLabel={t("sidebar.display.showBackground")}
            testID="sidebar-show-background"
          />
        </View>
      </MenuSurface>
    </MenuRoot>
  );
}

function SettingLabel({ icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <View style={styles.settingLabel}>
      <DensityIcon icon={icon} size="sm" color="foregroundMuted" />
      <Text style={styles.labelText}>{label}</Text>
    </View>
  );
}

function PreferenceToggle<Value extends string>({
  value,
  icon,
  label,
  selected,
  onToggle,
  testID,
}: {
  value: Value;
  icon: LucideIcon;
  label: string;
  selected: boolean;
  onToggle: (value: Value) => void;
  testID: string;
}) {
  const onChange = useCallback(() => onToggle(value), [onToggle, value]);
  return (
    <View style={styles.toggleRow}>
      <SettingLabel icon={icon} label={label} />
      <Switch
        value={selected}
        onValueChange={onChange}
        accessibilityLabel={label}
        testID={testID}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  trigger: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  triggerHovered: { backgroundColor: theme.colors.interactionHighlight },
  content: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    gap: theme.spacing[2],
  },
  settingRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    minHeight: 36,
  },
  settingLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    flexShrink: 1,
  },
  labelText: { color: theme.colors.foreground, fontSize: theme.fontSize.sm - 2, flexShrink: 1 },
  compactText: { fontSize: theme.fontSize.sm - 2 },
  segments: { alignSelf: "center", flexShrink: 0 },
  toggleList: { paddingHorizontal: theme.spacing[3] },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    minHeight: 36,
  },
  backgroundRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[2],
  },
}));
