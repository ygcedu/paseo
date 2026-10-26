export const SEARCH_TERMINAL_NAME = "__paseo_file_search__";

export interface WorkspaceSearchOptions {
  cwd: string;
  query: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  regex?: boolean;
  include?: string;
}

export interface WorkspaceSearchMatch {
  path: string;
  line: number;
  text: string;
  ranges: { start: number; end: number }[];
}

export interface WorkspaceSearchBatch {
  matches: WorkspaceSearchMatch[];
  truncated: boolean;
}
