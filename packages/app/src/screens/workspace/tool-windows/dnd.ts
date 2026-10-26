import { useCallback } from "react";
import type { View } from "react-native";
import { isWeb } from "@/constants/platform";
import { ToolWindowRegionSchema, type ToolWindowRegion } from "@/workspace-tabs/tool-windows/model";

export interface ToolWindowDropData {
  kind: "tool-window-region";
  region: ToolWindowRegion;
  beforeTabId: string | null;
}
export function isToolWindowDropData(data: unknown): data is ToolWindowDropData {
  if (typeof data !== "object" || data === null) return false;
  const beforeTabId = Reflect.get(data, "beforeTabId");
  const validBeforeTabId = beforeTabId === null || typeof beforeTabId === "string";
  return (
    validBeforeTabId &&
    Reflect.get(data, "kind") === "tool-window-region" &&
    ToolWindowRegionSchema.safeParse(Reflect.get(data, "region")).success
  );
}

export function useToolWindowNodeRef(...setters: ((node: HTMLElement | null) => void)[]) {
  // Tool windows are hosted by the desktop split canvas; native retains its Explorer shell.
  const first = setters[0];
  const second = setters[1];
  return useCallback(
    (node: View | null) => {
      if (!isWeb) return;
      const element = node instanceof HTMLElement ? node : null;
      first(element);
      second?.(element);
    },
    [first, second],
  );
}
