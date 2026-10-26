import { useQueryClient } from "@tanstack/react-query";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { WorkspaceSearchOptions, WorkspaceSearchMatch } from "./types";

import { searchWorkspaceThroughTerminal } from "./terminal-search";
import { useFetchQuery } from "@/data/query";

interface SearchResults {
  matches: WorkspaceSearchMatch[];
  truncated: boolean;
}

export function useWorkspaceContentSearch(
  serverId: string,
  client: DaemonClient | null,
  options: WorkspaceSearchOptions,
) {
  const queryClient = useQueryClient();
  const queryKey = ["workspaceContentSearch", serverId, options];
  return useFetchQuery({
    dataShape: "value",
    staleTimeMs: 0,
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
    queryKey,
    enabled: Boolean(client && options.query.length),
    retry: false,
    gcTime: 0,
    queryFn: async ({ signal }): Promise<SearchResults> => {
      if (!client) throw new Error("Host disconnected");
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer);
          reject(signal.reason);
        };
        const timer = setTimeout(() => {
          signal.removeEventListener("abort", abort);
          resolve();
        }, 150);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      });
      let result: SearchResults = { matches: [], truncated: false };
      await searchWorkspaceThroughTerminal(client, options, {
        signal,
        onBatch: (batch) => {
          if (signal.aborted) return;
          result = { matches: [...result.matches, ...batch.matches], truncated: batch.truncated };
          queryClient.setQueryData(queryKey, result);
        },
      });
      return result;
    },
  });
}
