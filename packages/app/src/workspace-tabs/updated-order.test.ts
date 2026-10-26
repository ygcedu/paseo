import { expect, it } from "vitest";
import { describeAgentUpdateAge } from "./updated-order";

it("keeps day counts for old agents and clamps future timestamps", () => {
  const now = new Date("2026-10-16T12:00:00Z");
  expect(describeAgentUpdateAge(new Date(now.getTime() - 3 * 3600000), now).label).toBe("3h ago");
  expect(describeAgentUpdateAge(new Date(now.getTime() - 14 * 86400000), now)).toEqual({
    label: "14d ago",
    resolution: "day",
  });
  expect(describeAgentUpdateAge(new Date(now.getTime() + 60000), now).label).toBe("0m ago");
});
