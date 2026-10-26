import { expect, test } from "../support/fixtures";
import { runWorkspaceActionFromCommandCenter } from "../support/helpers/command-center-workspace-actions";
import {
  clickNewChat,
  gotoWorkspace,
  pressDirectNewTabShortcut,
} from "../support/helpers/launcher";
import { seedWorkspace } from "../support/helpers/seed-client";
import { waitForWorkspaceTabsVisible } from "../support/helpers/workspace-tabs";

test.describe("Direct terminal shortcut pane placement", () => {
  test("opens terminals in the shared tool window while preserving the focused panes", async ({
    page,
  }) => {
    const workspace = await seedWorkspace({ repoPrefix: "direct-terminal-shortcut-pane-" });

    try {
      await gotoWorkspace(page, workspace.workspaceId);
      await waitForWorkspaceTabsVisible(page);
      await clickNewChat(page);

      await runWorkspaceActionFromCommandCenter(page, "Split pane right");
      const focusedPaneChild = page
        .getByTestId("split-group-child")
        .filter({ has: page.getByTestId("workspace-new-tab-panel") });
      const originalPaneChild = page
        .getByTestId("split-group-child")
        .filter({ hasNot: page.getByTestId("workspace-new-tab-panel") });
      await expect(focusedPaneChild).toBeVisible();
      const focusedPaneId = await focusedPaneChild
        .locator('[data-testid^="workspace-pane-"]')
        .getAttribute("data-testid");
      const originalPaneId = await originalPaneChild
        .locator('[data-testid^="workspace-pane-"]')
        .getAttribute("data-testid");
      expect(focusedPaneId).not.toBeNull();
      expect(originalPaneId).not.toBeNull();
      const focusedPane = page.getByTestId(focusedPaneId!);
      const originalPane = page.getByTestId(originalPaneId!);

      await focusedPane
        .getByTestId("workspace-new-tab-panel")
        .click({ position: { x: 10, y: 10 } });
      await expect(page.getByTestId("command-center-panel")).toHaveCount(0);
      await pressDirectNewTabShortcut(page, "t");

      const terminalWindow = page
        .locator('[data-testid^="tool-window-panel-"]')
        .filter({ has: page.getByTestId("terminal-session-tabs") });
      await expect(terminalWindow).toBeVisible({ timeout: 30_000 });
      await expect(terminalWindow.locator('[data-testid^="workspace-tab-terminal_"]')).toHaveCount(
        1,
      );
      await expect(focusedPane.locator('[data-testid^="workspace-tab-terminal_"]')).toHaveCount(0);
      await pressDirectNewTabShortcut(page, "t");
      await expect(terminalWindow.locator('[data-testid^="workspace-tab-terminal_"]')).toHaveCount(
        1,
      );
      await terminalWindow.getByRole("tab").last().hover();
      await page.getByTestId("terminal-session-new").click();
      await expect(terminalWindow.locator('[data-testid^="workspace-tab-terminal_"]')).toHaveCount(
        2,
      );
      await expect(terminalWindow).toHaveCount(1);
      await expect(originalPane.locator('[data-testid^="workspace-tab-terminal_"]')).toHaveCount(0);
    } finally {
      await workspace.cleanup();
    }
  });
});
