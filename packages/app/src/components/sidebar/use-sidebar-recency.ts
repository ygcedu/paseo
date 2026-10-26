import { useEffect, useState } from "react";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { shallow } from "zustand/shallow";
import { useSessionStore } from "@/stores/session-store";
import type { SidebarRecency } from "@/stores/sidebar-view-store";
import { recentWorkspaceIds } from "./sidebar-recency";

export function useSidebarRecency(
  recency: SidebarRecency,
  active = true,
): ReadonlySet<string> | null {
  const cutoff = useRecencyCutoff(recency, active);
  return useStoreWithEqualityFn(
    useSessionStore,
    (state) => {
      if (cutoff === null) return null;
      const keys = new Set<string>();
      for (const [serverId, session] of Object.entries(state.sessions)) {
        if (!session) continue;
        for (const id of recentWorkspaceIds(session.agents.values(), cutoff)) {
          keys.add(JSON.stringify([serverId, id]));
        }
      }
      return keys;
    },
    shallow,
  );
}

export function recencyWorkspaceKey(serverId: string, workspaceId: string): string {
  return JSON.stringify([serverId, workspaceId]);
}

export function useRecencyCutoff(recency: SidebarRecency, active = true): number | null {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (recency === "all" || !active) return;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, [recency, active]);
  return recency === "all" ? null : now - Number(recency) * 86_400_000;
}
