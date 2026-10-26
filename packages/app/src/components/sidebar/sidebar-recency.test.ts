import { describe, expect, it } from "vitest";
import { recentWorkspaceIds, sortProjectsByRecentConversation } from "./sidebar-recency";

describe("recent conversations", () => {
  it("keeps a workspace when any unarchived conversation received a user message in range", () => {
    const agent = (workspaceId: string, time: number | null, archivedAt: Date | null = null) => ({
      workspaceId,
      lastUserMessageAt: time === null ? null : new Date(time),
      archivedAt,
    });
    expect([
      ...recentWorkspaceIds(
        [
          agent("mixed", 99),
          agent("mixed", 100),
          agent("recent", 101),
          agent("old", 99),
          agent("no-message", null),
          agent("archived", 101, new Date(102)),
        ],
        100,
      ),
    ]).toEqual(["mixed", "recent"]);
  });
});

describe("project filter recency", () => {
  it("orders projects by their latest user message across hosts, ignoring archived conversations", () => {
    const project = (id: string, serverId = "a", workspaceId = id) => ({
      id,
      workspaces: [{ serverId, workspaceId }],
    });
    const agent = (workspaceId: string, time: number, archivedAt: Date | null = null) => ({
      workspaceId,
      lastUserMessageAt: new Date(time),
      archivedAt,
    });
    const projects = [
      project("empty"),
      project("older"),
      project("newer", "b", "older"),
      project("tied"),
    ];
    const sessions = {
      a: {
        agents: new Map([
          ["1", agent("older", 10)],
          ["2", agent("tied", 10)],
          ["3", agent("empty", 100, new Date(101))],
        ]),
      },
      b: { agents: new Map([["1", agent("older", 20)]]) },
    };
    expect(sortProjectsByRecentConversation(projects, sessions).map((entry) => entry.id)).toEqual([
      "newer",
      "older",
      "tied",
      "empty",
    ]);
    expect(projects.map((entry) => entry.id)).toEqual(["empty", "older", "newer", "tied"]);
    sessions.a.agents.set("4", agent("older", 30));
    expect(sortProjectsByRecentConversation(projects, sessions).map((entry) => entry.id)).toEqual([
      "older",
      "newer",
      "tied",
      "empty",
    ]);
  });
});
