import type { SessionConfigOption } from "@agentclientprotocol/sdk";

import type { SessionStateResponse } from "./acp-agent.js";

export function transformPiSessionResponse(
  response: SessionStateResponse,
): SessionStateResponse {
  const modes = response.modes;
  if (!modes?.availableModes?.length) {
    return response;
  }

  const thinkingOption: SessionConfigOption = {
    id: "thought_level",
    name: "Thinking",
    type: "select",
    category: "thought_level",
    currentValue: modes.currentModeId ?? "medium",
    options: modes.availableModes.map((mode) => ({
      value: mode.id,
      name: mode.name.replace(/^Thinking:\s*/i, ""),
      description: mode.description,
    })),
  };

  return {
    ...response,
    modes: undefined,
    configOptions: [thinkingOption, ...(response.configOptions ?? [])],
  };
}
