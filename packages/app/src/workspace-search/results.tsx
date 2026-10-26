import { useCallback, useEffect, useMemo, useRef } from "react";
import {
  FlatList,
  Text,
  View,
  type ListRenderItemInfo,
  type PressableStateCallbackType,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { WorkspaceSearchMatch } from "./types";
import { PressHighlight } from "@/components/ui/press-highlight";
import { MaterialFileIcon } from "@/components/material-file-icon";

const FILE_HEIGHT = 36;
const MATCH_HEIGHT = 32;
interface FileRow {
  kind: "file";
  path: string;
  count: number;
  offset: number;
}
interface MatchRow {
  kind: "match";
  match: WorkspaceSearchMatch;
  offset: number;
}
type ResultRow = FileRow | MatchRow;

export function matchKey(match: WorkspaceSearchMatch): string {
  return `${match.path}:${match.line}`;
}

export function groupSearchResults(matches: WorkspaceSearchMatch[]) {
  const groups = new Map<string, WorkspaceSearchMatch[]>();
  for (const match of matches) {
    const group = groups.get(match.path);
    if (group) group.push(match);
    else groups.set(match.path, [match]);
  }
  const rows: ResultRow[] = [];
  const orderedMatches: WorkspaceSearchMatch[] = [];
  let offset = 0;
  for (const [path, group] of groups) {
    rows.push({ kind: "file", path, count: group.length, offset });
    offset += FILE_HEIGHT;
    for (const match of group) {
      rows.push({ kind: "match", match, offset });
      orderedMatches.push(match);
      offset += MATCH_HEIGHT;
    }
  }
  return { rows, matches: orderedMatches, fileCount: groups.size };
}

export function SearchResults({
  rows,
  selectedKey,
  onOpen,
}: {
  rows: ResultRow[];
  selectedKey: string | null;
  onOpen: (match: WorkspaceSearchMatch) => void;
}) {
  const listRef = useRef<FlatList<ResultRow>>(null);
  const selectedRowIndex = rows.findIndex(
    (row) => row.kind === "match" && matchKey(row.match) === selectedKey,
  );
  useEffect(() => {
    if (!selectedKey || selectedRowIndex < 0) return;
    listRef.current?.scrollToIndex({ index: selectedRowIndex, animated: false, viewPosition: 0.5 });
  }, [selectedKey, selectedRowIndex]);
  const renderRow = useCallback(
    ({ item }: ListRenderItemInfo<ResultRow>) => {
      if (item.kind === "file") return <FileGroup path={item.path} count={item.count} />;
      return (
        <MatchResult
          match={item.match}
          selected={matchKey(item.match) === selectedKey}
          onOpen={onOpen}
        />
      );
    },
    [onOpen, selectedKey],
  );
  const getItemLayout = useCallback(
    (_data: ArrayLike<ResultRow> | null | undefined, index: number) => {
      const row = rows[index];
      return {
        index,
        length: row.kind === "file" ? FILE_HEIGHT : MATCH_HEIGHT,
        offset: row.offset,
      };
    },
    [rows],
  );
  return (
    <FlatList
      ref={listRef}
      data={rows}
      renderItem={renderRow}
      keyExtractor={rowKey}
      getItemLayout={getItemLayout}
      keyboardShouldPersistTaps="handled"
      initialNumToRender={24}
      style={styles.list}
      contentContainerStyle={styles.listContent}
      testID="workspace-search-results"
    />
  );
}

function rowKey(row: ResultRow): string {
  return row.kind === "file" ? `file:${row.path}` : matchKey(row.match);
}
function FileGroup({ path, count }: { path: string; count: number }) {
  const segments = path.split("/");
  const name = segments.pop() ?? path;
  const directory = segments.join("/");
  return (
    <View style={styles.file} testID="workspace-search-file-group">
      <MaterialFileIcon fileName={name} size={16} />
      <Text style={styles.filename} numberOfLines={1}>
        {name}
      </Text>
      <Text style={styles.directory} numberOfLines={1} ellipsizeMode="middle">
        {directory}
      </Text>
      <Text style={styles.count}>{count}</Text>
    </View>
  );
}

function MatchResult({
  match,
  selected,
  onOpen,
}: {
  match: WorkspaceSearchMatch;
  selected: boolean;
  onOpen: (match: WorkspaceSearchMatch) => void;
}) {
  const open = useCallback(() => onOpen(match), [match, onOpen]);
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  const rowStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType) => [
      styles.match,
      selected || hovered || pressed ? styles.selected : null,
    ],
    [selected],
  );
  const fragments = [];
  let cursor = 0;
  for (const range of match.ranges) {
    fragments.push(match.text.slice(cursor, range.start));
    fragments.push(
      <Text key={`${range.start}:${range.end}`} style={styles.highlight}>
        {match.text.slice(range.start, range.end)}
      </Text>,
    );
    cursor = range.end;
  }
  fragments.push(match.text.slice(cursor));
  return (
    <PressHighlight
      onPress={open}
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      aria-selected={selected}
      accessibilityLabel={`${match.path}:${match.line}`}
      style={rowStyle}
      testID="workspace-search-result"
    >
      <Text style={styles.line}>{match.line}</Text>
      <Text numberOfLines={1} style={styles.code}>
        {fragments}
      </Text>
    </PressHighlight>
  );
}

const styles = StyleSheet.create((theme) => ({
  list: { flex: 1 },
  listContent: { paddingHorizontal: theme.spacing[4], paddingBottom: theme.spacing[4] },
  file: {
    height: FILE_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    minWidth: 0,
  },
  filename: { color: theme.colors.foreground, fontSize: theme.fontSize.sm, flexShrink: 1 },
  directory: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    flex: 1,
    minWidth: 0,
  },
  count: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontVariant: ["tabular-nums"],
  },
  match: {
    height: MATCH_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    paddingRight: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  selected: { backgroundColor: theme.colors.interactionHighlight },
  line: {
    width: 48,
    textAlign: "right",
    paddingRight: theme.spacing[3],
    color: theme.colors.foregroundMuted,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
  },
  code: {
    flex: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontFamily: theme.fontFamily.mono,
  },
  highlight: { color: theme.colors.foreground, backgroundColor: theme.colors.surface3 },
}));
