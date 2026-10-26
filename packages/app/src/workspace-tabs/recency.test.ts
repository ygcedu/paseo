import { expect, it } from "vitest";
import { matchesTabRecency } from "./recency";

it("filters individual agent tabs while preserving tools and new conversation tabs", () => {
  const ids = new Set(["recent"]);
  expect(matchesTabRecency({ kind: "agent", agentId: "recent" }, ids)).toBe(true);
  expect(matchesTabRecency({ kind: "agent", agentId: "old" }, ids)).toBe(false);
  expect(matchesTabRecency({ kind: "agent", agentId: "old" }, null)).toBe(true);
  expect(matchesTabRecency({ kind: "terminal", terminalId: "shell" }, ids)).toBe(true);
  expect(matchesTabRecency({ kind: "draft", draftId: "new" }, ids)).toBe(true);
  expect(
    matchesTabRecency(
      { kind: "provider_subagent", parentAgentId: "old", subagentId: "child" },
      ids,
    ),
  ).toBe(false);
});
