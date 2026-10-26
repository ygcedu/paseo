import type { WorkspaceTabDescriptor } from "@/screens/workspace/workspace-tabs-types";
import type { WorkspaceTabMenuEntry } from "@/screens/workspace/workspace-tab-menu";

interface ToolWindowMenuInput {
  tab: WorkspaceTabDescriptor;
  tabs: WorkspaceTabDescriptor[];
}
export type ToolWindowMenuBuilder = (input: ToolWindowMenuInput) => WorkspaceTabMenuEntry[];
