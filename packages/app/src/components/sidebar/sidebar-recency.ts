import type { Agent } from "@/stores/session-store";

// Status updates and assistant output must not revive an old conversation.
export function recentWorkspaceIds(
  agents: Iterable<Pick<Agent, "archivedAt" | "workspaceId" | "lastUserMessageAt">>,
  cutoff: number,
): Set<string> {
  const ids = new Set<string>();
  for (const agent of agents) {
    if (
      !agent.archivedAt &&
      agent.workspaceId &&
      agent.lastUserMessageAt &&
      agent.lastUserMessageAt.getTime() >= cutoff
    ) {
      ids.add(agent.workspaceId);
    }
  }
  return ids;
}

export function sortProjectsByRecentConversation<
  T extends { workspaces: readonly { serverId: string; workspaceId: string }[] },
>(
  projects: readonly T[],
  sessions: Record<
    string,
    | {
        agents: ReadonlyMap<
          string,
          Pick<Agent, "archivedAt" | "workspaceId" | "lastUserMessageAt">
        >;
      }
    | undefined
  >,
): T[] {
  const activity = new Map<string, Map<string, number>>();
  for (const [serverId, session] of Object.entries(sessions)) {
    const workspaces = new Map<string, number>();
    for (const agent of session?.agents.values() ?? []) {
      if (agent.archivedAt || !agent.workspaceId || !agent.lastUserMessageAt) continue;
      workspaces.set(
        agent.workspaceId,
        Math.max(workspaces.get(agent.workspaceId) ?? 0, agent.lastUserMessageAt.getTime()),
      );
    }
    activity.set(serverId, workspaces);
  }
  return projects
    .map((project) => ({
      project,
      time: project.workspaces.reduce(
        (latest, workspace) =>
          Math.max(latest, activity.get(workspace.serverId)?.get(workspace.workspaceId) ?? 0),
        0,
      ),
    }))
    .sort((left, right) => right.time - left.time)
    .map(({ project }) => project);
}
