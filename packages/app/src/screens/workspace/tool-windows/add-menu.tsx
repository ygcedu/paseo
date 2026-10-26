import { useCallback } from "react";
import { Plus } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { ToolbarButton } from "@/components/ui/pane-content-toolbar";
import {
  useWorkspaceTabLaunchCatalog,
  type WorkspaceTabLaunchItem,
} from "@/workspace-tabs/launcher";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";
import type { Theme } from "@/styles/theme";
import type { ToolWindowRegion } from "@/workspace-tabs/tool-windows/model";

const ThemedPlus = withUnistyles(Plus);
const muted = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
interface AddMenuProps {
  workspaceKey: string;
  serverId: string;
  region: ToolWindowRegion;
  targets: readonly WorkspaceTabTarget[];
}
function AddItem({
  item,
  workspaceKey,
  region,
}: {
  item: WorkspaceTabLaunchItem;
  workspaceKey: string;
  region: ToolWindowRegion;
}) {
  const prepare = useWorkspaceLayoutStore((state) => state.prepareToolWindowLaunch);
  const launch = useCallback(() => {
    const paneId = prepare(workspaceKey);
    if (paneId) item.launch({ kind: "open", paneId, toolWindowRegion: region });
  }, [prepare, workspaceKey, region, item]);
  return (
    <DropdownMenuItem testID={`tool-window-add-${region}-${item.id}`} onSelect={launch}>
      {item.label}
    </DropdownMenuItem>
  );
}
export function ToolWindowAddMenu({ workspaceKey, serverId, region, targets }: AddMenuProps) {
  const { t } = useTranslation();
  const groups = useWorkspaceTabLaunchCatalog({
    serverId,
    host: "explorer",
    purpose: "supporting",
    surface: "menu",
  });
  return (
    <DropdownMenu>
      <ToolbarButton
        style={styles.add}
        kind="menu"
        label={t("workspace.tabs.toolWindows.add")}
        testID={`tool-window-add-${region}`}
      >
        <ThemedPlus size={16} uniProps={muted} />
      </ToolbarButton>
      <DropdownMenuContent
        side={region === "right" ? "left" : "right"}
        align={region === "bottom" ? "end" : "start"}
        minWidth={220}
        testID={`tool-window-add-menu-${region}`}
      >
        {groups
          .flatMap((group) => group.items)
          .filter(
            (item) =>
              !(
                item.panelKind === "terminal" &&
                (item.id !== "terminal" || targets.some((target) => target.kind === "terminal"))
              ) &&
              (!item.target ||
                !targets.some((target) => {
                  if (target.kind !== item.target?.kind) return false;
                  if (target.kind === "plugin" && item.target.kind === "plugin") {
                    return (
                      target.pluginId === item.target.pluginId &&
                      target.panelId === item.target.panelId &&
                      target.context === item.target.context
                    );
                  }
                  return true;
                })),
          )
          .map((item) => (
            <AddItem key={item.id} item={item} workspaceKey={workspaceKey} region={region} />
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const styles = StyleSheet.create((theme) => ({
  add: { width: 32, height: 32, borderRadius: theme.borderRadius.md },
}));
