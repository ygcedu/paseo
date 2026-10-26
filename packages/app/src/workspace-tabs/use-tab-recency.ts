import { useCallback } from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";
import { useSessionStore } from "@/stores/session-store";
import { useSidebarViewStore } from "@/stores/sidebar-view-store";
import { useRecencyCutoff } from "@/components/sidebar/use-sidebar-recency";
import type { WorkspaceTabTarget } from "./model";
import { matchesTabRecency } from "./recency";

export function useTabRecency(serverId: string) {
  const recency = useSidebarViewStore((state) => state.recency);
  const cutoff = useRecencyCutoff(recency);
  const recentAgentIds = useStoreWithEqualityFn(
    useSessionStore,
    (state) => {
      if (cutoff === null) return null;
      const ids = new Set<string>();
      for (const agent of state.sessions[serverId]?.agents.values() ?? []) {
        if (agent.lastUserMessageAt && agent.lastUserMessageAt.getTime() >= cutoff)
          ids.add(agent.id);
      }
      return ids;
    },
    shallow,
  );
  return useCallback(
    (target: WorkspaceTabTarget) => matchesTabRecency(target, recentAgentIds),
    [recentAgentIds],
  );
}
