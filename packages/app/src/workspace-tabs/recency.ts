import type { WorkspaceTabTarget } from "./model";

export function matchesTabRecency(
  target: WorkspaceTabTarget,
  recentAgentIds: ReadonlySet<string> | null,
): boolean {
  if (!recentAgentIds) return true;
  if (target.kind === "agent") return recentAgentIds.has(target.agentId);
  if (target.kind === "provider_subagent") return recentAgentIds.has(target.parentAgentId);
  return true;
}
