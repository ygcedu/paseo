import { useStoreWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";
import { useSessionStore } from "@/stores/session-store";
import { sortProjectsByRecentConversation } from "./sidebar-recency";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, RotateCcw, Circle } from "lucide-react-native";
import { ScrollView, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { settingsStyles } from "@/styles/settings";
import { workspaceLabelKey, type WorkspaceLabelColor } from "@getpaseo/protocol/workspace-labels";
import { HostStatusDot } from "@/components/host-status-dot";
import { DensityIcon } from "@/components/ui/density-icon";
import { Button } from "@/components/ui/button";
import { useHosts } from "@/runtime/host-runtime";
import {
  useSidebarViewStore,
  hasActiveSidebarLabelFilter,
  SIDEBAR_UNLABELLED_LABEL_KEY,
  type SidebarRecency,
} from "@/stores/sidebar-view-store";
import { useSidebarModel } from "./sidebar-model";
import { SidebarDisplayPreferencesMenu } from "./display-preferences/menu";
import { useWorkspaceLabelProjection } from "@/workspace-labels";
import { ProjectIconView } from "@/components/project-icon-view";
import { useProjectIcons } from "@/projects/icons";
import { resolveSidebarProjectIconTargets } from "@/utils/sidebar-project-row-model";
import { projectIconPlaceholderLabelFromDisplayName } from "@/utils/project-display-name";
import { WorkspaceLabelDot } from "@/workspace-labels/swatch";

type FilterSection = "recency" | "host" | "project" | "label";
const RANGES: SidebarRecency[] = ["1", "3", "7", "30"];

export function SidebarQuickFilters() {
  const { t } = useTranslation();
  const hosts = useHosts();
  const { allProjects, resolvedProjectFilters } = useSidebarModel();
  const { labels } = useWorkspaceLabelProjection();
  const recency = useSidebarViewStore((state) => state.recency);
  const hostFilters = useSidebarViewStore((state) => state.hostFilters);
  const hideAllHosts = useSidebarViewStore((state) => state.hideAllHosts);
  const labelFilter = useSidebarViewStore((state) => state.labelFilter);
  const clearFilters = useSidebarViewStore((state) => state.clearFilters);
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = useCallback(() => setExpanded((value) => !value), []);
  const expandedState = useMemo(() => ({ expanded }), [expanded]);
  const expandIcon = useMemo(
    () => (
      <View style={styles.expandIcon}>
        <DensityIcon icon={expanded ? ChevronUp : ChevronDown} size="xs" color="foregroundMuted" />
      </View>
    ),
    [expanded],
  );
  const hostActive = hideAllHosts || hostFilters.length > 0;
  const projectActive = resolvedProjectFilters.length > 0;
  const labelActive = hasActiveSidebarLabelFilter(labelFilter);
  const hasFilters = hostActive || projectActive || labelActive || recency !== "all";
  const sections = useMemo(() => {
    const entries: { value: FilterSection; label: string; testID: string }[] = [
      {
        value: "recency",
        label: t("sidebar.display.recency.label"),
        testID: "sidebar-filter-recency",
      },
    ];
    if (hosts.length > 1 || hostActive)
      entries.push({
        value: "host",
        label: t("sidebar.display.hostFilter.label"),
        testID: "sidebar-filter-host",
      });
    if (allProjects.length > 1 || projectActive)
      entries.push({
        value: "project",
        label: t("sidebar.display.projectFilter.label"),
        testID: "sidebar-filter-project",
      });
    if (labels.length > 0 || labelActive)
      entries.push({
        value: "label",
        label: t("workspaceLabels.title"),
        testID: "sidebar-filter-label",
      });
    return entries;
  }, [hosts.length, hostActive, allProjects.length, projectActive, labels.length, labelActive, t]);
  const summary = [
    recency !== "all" ? t(`sidebar.display.recency.${recency}`) : null,
    ...hosts.filter((host) => hostFilters.includes(host.serverId)).map((host) => host.label),
    hideAllHosts ? t("sidebar.host.noHost") : null,
    ...allProjects
      .filter((project) => resolvedProjectFilters.includes(project.viewKey))
      .map((project) => project.projectName),
    ...labelFilter.labels.map((key) =>
      key === SIDEBAR_UNLABELLED_LABEL_KEY
        ? t("workspaceLabels.unlabelled")
        : (labels.find((label) => workspaceLabelKey(label.name) === key)?.name ?? key),
    ),
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <View
      style={[styles.container, !expanded && styles.collapsedContainer]}
      testID="sidebar-quick-filters"
    >
      <View style={settingsStyles.card}>
        <View style={styles.header}>
          <Button
            variant="ghost"
            size="xs"
            trailing={expandIcon}
            style={styles.toggle}
            textStyle={styles.heading}
            numberOfLines={1}
            onPress={toggleExpanded}
            accessibilityLabel={t("sidebar.filters.heading")}
            accessibilityState={expandedState}
            aria-expanded={expanded}
            testID="sidebar-filters-trigger"
          >
            {expanded ? t("sidebar.filters.heading") : summary || t("sidebar.filters.heading")}
          </Button>
          <View style={styles.headerActions}>
            {hasFilters ? (
              <Button
                variant="ghost"
                size="xs"
                leftIcon={RotateCcw}
                onPress={clearFilters}
                accessibilityLabel={t("sidebar.filterEmpty.clear")}
                testID="sidebar-clear-filters"
              />
            ) : null}
            <SidebarDisplayPreferencesMenu />
          </View>
        </View>
        {expanded ? (
          <View style={styles.body} testID="sidebar-filters-content">
            {sections.map((entry) => (
              <View key={entry.value} style={styles.filterRow} testID={entry.testID}>
                <FilterSectionReset section={entry.value} label={entry.label} />
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  keyboardShouldPersistTaps="handled"
                  style={styles.rowScroll}
                  contentContainerStyle={styles.rowOptions}
                >
                  <FilterSectionContent section={entry.value} />
                </ScrollView>
              </View>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function FilterSectionReset({ section, label }: { section: FilterSection; label: string }) {
  const recency = useSidebarViewStore((state) => state.recency);
  const hostFilters = useSidebarViewStore((state) => state.hostFilters);
  const hideAllHosts = useSidebarViewStore((state) => state.hideAllHosts);
  const labelFilter = useSidebarViewStore((state) => state.labelFilter);
  const { resolvedProjectFilters } = useSidebarModel();
  const setRecency = useSidebarViewStore((state) => state.setRecency);
  const clearHostFilters = useSidebarViewStore((state) => state.clearHostFilters);
  const clearProjectFilters = useSidebarViewStore((state) => state.clearProjectFilters);
  const clearLabelFilter = useSidebarViewStore((state) => state.clearLabelFilter);
  const resetRecency = useCallback(() => setRecency("all"), [setRecency]);
  const options = {
    recency: { selected: recency === "all", onPress: resetRecency },
    host: { selected: !hideAllHosts && hostFilters.length === 0, onPress: clearHostFilters },
    project: { selected: resolvedProjectFilters.length === 0, onPress: clearProjectFilters },
    label: { selected: !hasActiveSidebarLabelFilter(labelFilter), onPress: clearLabelFilter },
  };
  return (
    <FilterOption
      label={label}
      selected={options[section].selected}
      onPress={options[section].onPress}
      testID={`sidebar-${section}-filter-all`}
    />
  );
}

function FilterSectionContent({ section }: { section: FilterSection }) {
  switch (section) {
    case "recency":
      return <InlineRecencyFilter />;
    case "host":
      return <InlineHostFilter />;
    case "project":
      return <InlineProjectFilter />;
    case "label":
      return <InlineLabelFilter />;
  }
}

function InlineRecencyFilter() {
  const { t } = useTranslation();
  const recency = useSidebarViewStore((state) => state.recency);
  const setRecency = useSidebarViewStore((state) => state.setRecency);
  return RANGES.map((value) => (
    <FilterOption
      key={value}
      label={t(`sidebar.display.recency.short.${value}`)}
      selected={recency === value}
      value={value}
      onToggle={setRecency}
      testID={`sidebar-recency-${value}`}
    />
  ));
}

function InlineHostFilter() {
  const hosts = useHosts();
  const hostFilters = useSidebarViewStore((state) => state.hostFilters);
  const toggleHostFilter = useSidebarViewStore((state) => state.toggleHostFilter);
  return (
    <>
      {hosts.map((host) => (
        <FilterOption
          key={host.serverId}
          value={host.serverId}
          label={host.label}
          statusServerId={host.serverId}
          selected={hostFilters.includes(host.serverId)}
          onToggle={toggleHostFilter}
          testID={`sidebar-host-filter-${host.serverId}`}
        />
      ))}
    </>
  );
}

function InlineLabelFilter() {
  const { t } = useTranslation();
  const { labels } = useWorkspaceLabelProjection();
  const filter = useSidebarViewStore((state) => state.labelFilter);
  const toggle = useSidebarViewStore((state) => state.toggleLabelFilter);
  return (
    <>
      {labels.map((label) => (
        <LabelFilterOption
          color={label.color}
          key={workspaceLabelKey(label.name)}
          value={label.name}
          label={label.name}
          selected={filter.labels.includes(workspaceLabelKey(label.name))}
          onToggle={toggle}
          testID={`sidebar-label-filter-option-${label.name}`}
        />
      ))}
      <LabelFilterOption
        color={null}
        value={SIDEBAR_UNLABELLED_LABEL_KEY}
        label={t("workspaceLabels.unlabelled")}
        selected={filter.labels.includes(SIDEBAR_UNLABELLED_LABEL_KEY)}
        onToggle={toggle}
        testID="sidebar-label-filter-option-unlabelled"
      />
    </>
  );
}

function InlineProjectFilter() {
  const { allProjects, resolvedProjectFilters } = useSidebarModel();
  const selectProjects = useCallback(
    (state: ReturnType<typeof useSessionStore.getState>) =>
      sortProjectsByRecentConversation(allProjects, state.sessions),
    [allProjects],
  );
  const projects = useStoreWithEqualityFn(useSessionStore, selectProjects, shallow);
  const toggleProjectFilter = useSidebarViewStore((state) => state.toggleProjectFilter);
  const iconTargets = useMemo(() => resolveSidebarProjectIconTargets(allProjects), [allProjects]);
  const icons = useProjectIcons({ projects: iconTargets });
  return (
    <>
      {projects.map((project) => (
        <ProjectFilterOption
          iconDataUri={icons.get(project.viewKey) ?? null}
          key={project.viewKey}
          value={project.viewKey}
          label={project.projectName}
          selected={resolvedProjectFilters.includes(project.viewKey)}
          onToggle={toggleProjectFilter}
          testID={`sidebar-project-filter-${project.viewKey}`}
        />
      ))}
    </>
  );
}

interface VisualFilterOptionProps {
  value: string;
  label: string;
  selected: boolean;
  onToggle: (value: string) => void;
  testID: string;
}

function ProjectFilterOption({
  iconDataUri,
  ...props
}: VisualFilterOptionProps & { iconDataUri: string | null }) {
  const leading = useMemo(
    () => (
      <View testID={`${props.testID}-icon`}>
        <ProjectIconView
          iconDataUri={iconDataUri}
          initial={projectIconPlaceholderLabelFromDisplayName(props.label).charAt(0).toUpperCase()}
          projectViewKey={props.value}
          size={14}
          textStyle={styles.projectInitial}
        />
      </View>
    ),
    [iconDataUri, props.label, props.value, props.testID],
  );
  return <FilterOption {...props} leading={leading} />;
}

function LabelFilterOption({
  color,
  ...props
}: VisualFilterOptionProps & { color: WorkspaceLabelColor | null }) {
  const leading = useMemo(
    () => (
      <View style={styles.labelMark} testID={`${props.testID}-icon`}>
        {color ? (
          <WorkspaceLabelDot color={color} />
        ) : (
          <DensityIcon icon={Circle} size="xs" color="foregroundMuted" />
        )}
      </View>
    ),
    [color, props.testID],
  );
  return <FilterOption {...props} leading={leading} />;
}

type FilterOptionProps<T extends string> = {
  label: string;
  statusServerId?: string;
  leading?: ReactNode;
  selected: boolean;
  testID: string;
} & (
  | { onPress: () => void; value?: never; onToggle?: never }
  | { value: T; onToggle: (value: T) => void; onPress?: never }
);

function FilterOption<T extends string>(props: FilterOptionProps<T>) {
  const [hovered, setHovered] = useState(false);
  const onHoverIn = useCallback(() => setHovered(true), []);
  const onHoverOut = useCallback(() => setHovered(false), []);
  const onPress = useCallback(() => {
    if (props.onPress) props.onPress();
    else props.onToggle(props.value);
  }, [props]);
  const mark = useMemo(
    () => (
      <View style={styles.marks}>
        {props.leading}
        {props.statusServerId ? (
          <View testID={`sidebar-host-filter-status-${props.statusServerId}`}>
            <HostStatusDot serverId={props.statusServerId} />
          </View>
        ) : null}
      </View>
    ),
    [props.statusServerId, props.leading],
  );
  const state = useMemo(() => ({ checked: props.selected }), [props.selected]);
  return (
    <Button
      variant="ghost"
      size="xs"
      leftIcon={props.leading || props.statusServerId ? mark : null}
      style={[
        styles.option,
        hovered && !props.selected && styles.hoveredOption,
        props.selected && styles.selectedOption,
      ]}
      textStyle={[styles.optionText, props.selected && styles.selectedText]}
      onPress={onPress}
      onHoverIn={onHoverIn}
      onHoverOut={onHoverOut}
      accessibilityRole="checkbox"
      accessibilityState={state}
      aria-checked={props.selected}
      testID={props.testID}
    >
      {props.label}
    </Button>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    ...theme.shadow.sm,
    shadowColor: theme.shadow.lg.shadowColor,
    shadowRadius: 4,
    shadowOpacity: 1,
    backgroundColor: theme.colors.surface1,
    borderRadius: theme.borderRadius.lg,
    marginHorizontal: theme.spacing[2],
    marginTop: theme.spacing[2],
    marginBottom: 0,
  },
  collapsedContainer: {
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    elevation: 1,
  },
  header: {
    backgroundColor: theme.colors.surfaceSidebarHover,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  toggle: { flex: 1, minWidth: 0, justifyContent: "flex-start", paddingHorizontal: 0 },
  expandIcon: { flexShrink: 0 },
  headerActions: { flexDirection: "row", alignItems: "center", flexShrink: 0 },
  heading: { color: theme.colors.foregroundMuted, flexShrink: 1, minWidth: 0 },
  body: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: theme.spacing[2],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[2],
    gap: theme.spacing[1],
  },
  filterRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing[2] },
  rowScroll: { flex: 1, flexGrow: 1 },
  rowOptions: { alignItems: "center", gap: theme.spacing[1] },
  hoveredOption: { backgroundColor: theme.colors.interactionHighlight },
  selectedOption: { backgroundColor: theme.colors.sidebarFilterSelectedBackground },
  selectedText: { color: theme.colors.sidebarFilterSelectedForeground },
  projectInitial: { fontSize: 8 },
  labelMark: { width: 14, height: 14, alignItems: "center", justifyContent: "center" },
  option: {
    justifyContent: "flex-start",
    minHeight: 24,
    paddingHorizontal: theme.spacing[2],
    gap: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
  },
  optionText: {
    fontSize: theme.fontSize.sm - 2,
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
  },
  marks: { flexDirection: "row", alignItems: "center", gap: theme.spacing[1] },
}));
