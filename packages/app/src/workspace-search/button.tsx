import { useCallback, useMemo, useReducer, useRef, useState } from "react";
import { Text, View } from "react-native";
import { Search, SlidersHorizontal, X } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import type { WorkspaceSearchMatch } from "./types";
import { HeaderToggleButton } from "@/components/headers/header-toggle-button";
import { mutedIconColorMapping } from "@/components/ui/icon-color";
import { AdaptiveModalSheet, AdaptiveTextInput } from "@/components/adaptive-modal-sheet";
import { EditingTextInput, type EditingTextInputHandle } from "@/components/ui/text-input";
import { ToolbarButton, ToolbarControls } from "@/components/ui/pane-content-toolbar";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { Button } from "@/components/ui/button";
import { useSessionStore } from "@/stores/session-store";
import { useWorkspaceLayoutStore, FOCUSED_PANE_PLACEMENT } from "@/stores/workspace-layout-store";
import { openExplorerSidebarView } from "@/workspace-tabs/explorer-sidebar";
import { collectAllTabs } from "@/stores/workspace-layout-store";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isWeb } from "@/constants/platform";
import { SearchEnvironmentError } from "./terminal-search";
import { useWorkspaceContentSearch } from "./query";
import { useSearchKeyboard } from "./keyboard";
import { groupSearchResults, matchKey, SearchResults } from "./results";

const EMPTY_MATCHES: WorkspaceSearchMatch[] = [];
const ThemedSearch = withUnistyles(Search, mutedIconColorMapping);
const ThemedX = withUnistyles(X, mutedIconColorMapping);
const ThemedSpinner = withUnistyles(LoadingSpinner, mutedIconColorMapping);
const SearchInput = withUnistyles(EditingTextInput, (theme) => ({
  placeholderTextColor: theme.colors.foregroundMuted,
}));
interface SearchScope {
  serverId: string;
  workspaceId: string;
  cwd: string;
  onFileNavigation: (tabId: string) => void;
}
interface SearchControls {
  query: string;
  include: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regex: boolean;
  filterOpen: boolean;
  focused: boolean;
  selectedKey: string | null;
}
const initialControls: SearchControls = {
  query: "",
  include: "",
  caseSensitive: false,
  wholeWord: false,
  regex: false,
  filterOpen: false,
  focused: false,
  selectedKey: null,
};
function updateControls(state: SearchControls, patch: Partial<SearchControls>) {
  return { ...state, ...patch };
}

export function WorkspaceSearchButton(props: SearchScope) {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);
  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);
  const tooltipKeys = useMemo(() => [], []);
  return (
    <>
      <HeaderToggleButton
        tooltipKeys={tooltipKeys}
        tooltipSide="bottom"
        tooltipLabel={t("workspaceSearch.title")}
        accessibilityLabel={t("workspaceSearch.title")}
        accessibilityRole="button"
        testID="workspace-search-button"
        onPress={open}
      >
        <ThemedSearch size={16} />
      </HeaderToggleButton>
      {visible ? <SearchDialog {...props} onClose={close} /> : null}
    </>
  );
}

function SearchDialog(props: SearchScope & { onClose: () => void }) {
  return <SearchContent {...props} />;
}

function SearchContent({
  serverId,
  workspaceId,
  cwd,
  onFileNavigation,
  onClose,
}: SearchScope & { onClose: () => void }) {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const [controls, dispatch] = useReducer(updateControls, initialControls);
  const inputRef = useRef<EditingTextInputHandle>(null);
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const { query, include, caseSensitive, wholeWord, regex } = controls;
  const options = useMemo(
    () => ({ cwd, query, include, caseSensitive, wholeWord, regex }),
    [cwd, query, include, caseSensitive, wholeWord, regex],
  );
  const search = useWorkspaceContentSearch(serverId, client, options);
  const model = useMemo(
    () => groupSearchResults(search.data?.matches ?? EMPTY_MATCHES),
    [search.data?.matches],
  );
  const selectedMatch =
    model.matches.find((match) => matchKey(match) === controls.selectedKey) ?? model.matches[0];
  const selectedKey = selectedMatch ? matchKey(selectedMatch) : null;
  const setQuery = useCallback(
    (nextQuery: string) => dispatch({ query: nextQuery, selectedKey: null }),
    [],
  );
  const setInclude = useCallback(
    (nextInclude: string) => dispatch({ include: nextInclude, selectedKey: null }),
    [],
  );
  const focus = useCallback(() => dispatch({ focused: true }), []);
  const blur = useCallback(() => dispatch({ focused: false }), []);
  const clear = useCallback(() => {
    inputRef.current?.replaceText("");
    setQuery("");
    inputRef.current?.focus();
  }, [setQuery]);
  const toggleFilters = useCallback(
    () => dispatch({ filterOpen: !controls.filterOpen }),
    [controls.filterOpen],
  );
  const filterAccessibilityState = useMemo(
    () => ({ expanded: controls.filterOpen }),
    [controls.filterOpen],
  );
  const header = useMemo(() => ({ title: t("workspaceSearch.title") }), [t]);
  const openMatch = useCallback(
    (match: WorkspaceSearchMatch) => {
      const workspaceKey = buildWorkspaceTabPersistenceKey({ serverId, workspaceId });
      if (!workspaceKey) return;
      const store = useWorkspaceLayoutStore.getState();
      const tabId = store.openTab({
        workspaceKey,
        target: { kind: "file", path: match.path, lineStart: match.line, lineEnd: match.line },
        intent: "reveal",
        placement: FOCUSED_PANE_PLACEMENT,
      });
      if (!tabId) return;
      if (!isCompact) {
        openExplorerSidebarView({
          workspaceKey,
          isCompact,
          view: "files",
        });
        const layout = useWorkspaceLayoutStore.getState().layoutByWorkspace[workspaceKey];
        const filesTab =
          layout && collectAllTabs(layout.root).find((tab) => tab.target.kind === "files");
        if (filesTab)
          store.setTabState(workspaceKey, filesTab.tabId, {
            revealPath: match.path,
            revealRevision: Date.now(),
          });
      }
      onFileNavigation(tabId);
      onClose();
    },
    [serverId, workspaceId, isCompact, onFileNavigation, onClose],
  );
  const moveSelection = useCallback(
    (direction: number) => {
      if (!model.matches.length) return;
      const current = model.matches.findIndex((match) => matchKey(match) === selectedKey);
      const next = (current + direction + model.matches.length) % model.matches.length;
      dispatch({ selectedKey: matchKey(model.matches[next]) });
    },
    [model.matches, selectedKey],
  );
  const openSelected = useCallback(() => {
    if (selectedMatch) openMatch(selectedMatch);
  }, [openMatch, selectedMatch]);
  useSearchKeyboard({ inputRef, onMove: moveSelection, onOpen: openSelected });
  const { refetch } = search;
  const retry = useCallback(() => {
    void refetch();
  }, [refetch]);
  const toggles = useMemo(
    () => [
      {
        key: "caseSensitive" as const,
        label: "Aa",
        description: t("workspaceSearch.caseSensitive"),
      },
      { key: "wholeWord" as const, label: "W", description: t("workspaceSearch.wholeWord") },
      { key: "regex" as const, label: ".*", description: t("workspaceSearch.regex") },
    ],
    [t],
  );
  const status = query
    ? t("workspaceSearch.count", { count: model.matches.length, files: model.fileCount })
    : cwd.split(/[\\/]/).findLast(Boolean);
  const showKeyboardHint = isWeb && !isCompact;
  return (
    <AdaptiveModalSheet
      visible
      onClose={onClose}
      header={header}
      desktopMaxWidth={840}
      desktopHeight={480}
      scrollable={false}
      contentStyle={styles.body}
      testID="workspace-search-dialog"
    >
      <View style={styles.searchArea}>
        <View style={[styles.searchField, controls.focused ? styles.focusedField : null]}>
          <ThemedSearch size={18} />
          <SearchInput
            ref={inputRef}
            autoFocus
            initialValue=""
            onChangeText={setQuery}
            onFocus={focus}
            onBlur={blur}
            placeholder={t("workspaceSearch.placeholder")}
            accessibilityLabel={t("workspaceSearch.placeholder")}
            style={styles.input}
            testID="workspace-search-input"
            autoCorrect={false}
            autoCapitalize="none"
          />
          <ToolbarControls>
            {toggles.map(({ key, label, description }) => (
              <SearchToggle
                key={key}
                name={key}
                label={label}
                description={description}
                selected={controls[key]}
                dispatch={dispatch}
              />
            ))}
          </ToolbarControls>
          <View style={styles.clearSlot}>
            {query ? (
              <ToolbarButton
                compact
                label={t("workspaceSearch.clear")}
                testID="workspace-search-clear"
                onPress={clear}
              >
                <ThemedX size={14} />
              </ToolbarButton>
            ) : null}
          </View>
        </View>
        {controls.filterOpen ? (
          <View style={styles.filterArea}>
            <AdaptiveTextInput
              initialValue={include}
              onChangeText={setInclude}
              placeholder={t("workspaceSearch.fileFilter")}
              accessibilityLabel={t("workspaceSearch.fileFilter")}
              style={styles.filter}
              autoCorrect={false}
              autoCapitalize="none"
              testID="workspace-search-filter"
            />
            <Text style={styles.scope}>{t("workspaceSearch.scope")}</Text>
          </View>
        ) : null}
        <View style={styles.statusRow}>
          <View style={styles.statusText} accessibilityLiveRegion="polite">
            {search.isFetching ? <ThemedSpinner size={12} /> : null}
            <Text style={styles.status} numberOfLines={1}>
              {search.isFetching ? t("workspaceSearch.searching") : status}
            </Text>
          </View>
          <Button
            variant={controls.filterOpen || include ? "secondary" : "ghost"}
            size="xs"
            leftIcon={SlidersHorizontal}
            onPress={toggleFilters}
            accessibilityState={filterAccessibilityState}
            testID="workspace-search-filter-toggle"
          >
            {t("workspaceSearch.filters")}
          </Button>
        </View>
      </View>
      {model.matches.length ? (
        <SearchResults rows={model.rows} selectedKey={selectedKey} onOpen={openMatch} />
      ) : (
        <SearchEmptyState
          query={query}
          searching={search.isFetching}
          error={search.error}
          onRetry={retry}
        />
      )}
      {model.matches.length && search.error ? (
        <Text style={styles.errorNotice}>{search.error.message}</Text>
      ) : null}
      {search.data?.truncated ? (
        <Text style={styles.notice}>{t("workspaceSearch.truncated")}</Text>
      ) : null}
      {showKeyboardHint ? (
        <View style={styles.footer}>
          <Text style={styles.status}>{t("workspaceSearch.keyboardHint")}</Text>
        </View>
      ) : null}
    </AdaptiveModalSheet>
  );
}

function SearchEmptyState({
  query,
  searching,
  error,
  onRetry,
}: {
  query: string;
  searching: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  const { t } = useTranslation();
  if (error)
    return (
      <View style={styles.empty}>
        <Text style={styles.error}>
          {error instanceof SearchEnvironmentError
            ? t("workspaceSearch.environmentRequired")
            : error.message}
        </Text>
        <Button variant="ghost" size="sm" onPress={onRetry}>
          {t("paneFind.retry")}
        </Button>
      </View>
    );
  let label = t("workspaceSearch.hint");
  if (searching) label = t("workspaceSearch.searching");
  else if (query) label = t("common.empty.noResults");
  return (
    <View style={styles.empty} testID="workspace-search-empty">
      <Text style={styles.emptyTitle}>{label}</Text>
      {query && !searching ? (
        <Text style={styles.status}>{t("workspaceSearch.noResultsHint")}</Text>
      ) : null}
    </View>
  );
}

function SearchToggle({
  name,
  label,
  description,
  selected,
  dispatch,
}: {
  name: "caseSensitive" | "wholeWord" | "regex";
  label: string;
  description: string;
  selected: boolean;
  dispatch: (patch: Partial<SearchControls>) => void;
}) {
  const toggle = useCallback(
    () => dispatch({ [name]: !selected, selectedKey: null }),
    [dispatch, name, selected],
  );
  return (
    <ToolbarButton compact label={description} selected={selected} onPress={toggle}>
      <Text style={[styles.toggle, selected ? styles.toggleSelected : null]}>{label}</Text>
    </ToolbarButton>
  );
}

const styles = StyleSheet.create((theme) => ({
  body: { flex: 1, minHeight: 0, padding: 0 },
  searchArea: {
    paddingHorizontal: theme.spacing[6],
    paddingTop: theme.spacing[4],
    gap: theme.spacing[2],
  },
  searchField: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    height: 44,
    paddingLeft: theme.spacing[3],
    paddingRight: theme.spacing[1],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
  },
  focusedField: { borderColor: theme.colors.accent },
  input: {
    flex: 1,
    minWidth: 0,
    height: "100%",
    padding: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    outlineWidth: 0,
    outlineColor: "transparent",
  },
  clearSlot: { width: 32, height: 32 },
  toggle: {
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  toggleSelected: { color: theme.colors.foreground },
  filterArea: { gap: theme.spacing[2] },
  filter: {
    padding: theme.spacing[2],
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    fontSize: theme.fontSize.sm,
  },
  scope: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm, lineHeight: 18 },
  statusRow: {
    height: 32,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
  },
  statusText: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  status: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[6],
    gap: theme.spacing[2],
  },
  emptyTitle: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.base },
  error: { color: theme.colors.statusDanger, fontSize: theme.fontSize.sm, maxWidth: "100%" },
  errorNotice: {
    paddingHorizontal: theme.spacing[6],
    paddingVertical: theme.spacing[2],
    color: theme.colors.statusDanger,
    fontSize: theme.fontSize.sm,
  },
  notice: {
    paddingHorizontal: theme.spacing[6],
    paddingVertical: theme.spacing[2],
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingHorizontal: theme.spacing[6],
    height: 36,
    justifyContent: "center",
  },
}));
