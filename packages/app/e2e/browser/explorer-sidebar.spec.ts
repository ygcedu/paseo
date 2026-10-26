import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "../support/fixtures";
import { gotoWorkspace } from "../support/helpers/launcher";
import {
  openFilesPanel,
  openChangesTreePanel,
  waitForWorkspaceTabsVisible,
} from "../support/helpers/workspace-tabs";

function panel(page: Page, tabId: string) {
  return page.getByTestId(`tool-window-panel-${tabId}`).filter({ visible: true });
}
async function drag(page: Page, source: Locator, destination: Locator) {
  const from = await source.boundingBox();
  const to = await destination.boundingBox();
  if (!from || !to) throw new Error("Tool window drag geometry missing");
  const x = from.x + from.width / 2;
  const y = from.y + from.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 12, y + 4);
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 20 });
  await page.mouse.up();
}
async function expectSameNode(
  original: Awaited<ReturnType<Locator["elementHandle"]>>,
  locator: Locator,
) {
  if (!original) throw new Error("Tool window content missing");
  const current = await locator.elementHandle();
  expect(await original.evaluate((node, candidate) => node === candidate, current)).toBe(true);
}

async function expectVisibleChromeAlignment(
  page: Page,
  leftFrame: { x: number; width: number },
  rightFrame: { x: number; width: number },
) {
  const navigationFrame = await page.getByTestId("desktop-navigation-panel").boundingBox();
  const filesIconFrame = await page.getByTestId("tool-window-icon-files").boundingBox();
  const rightIconFrame = await page
    .getByTestId("tool-window-rail-right")
    .locator('[data-testid^="tool-window-icon-"]')
    .first()
    .boundingBox();
  const toggleFrame = await page.getByTestId("menu-button").boundingBox();
  const visibleViewport = page.viewportSize();
  if (!navigationFrame || !filesIconFrame || !rightIconFrame || !toggleFrame || !visibleViewport)
    throw new Error("Visible chrome geometry missing");
  expect(filesIconFrame.x - navigationFrame.x - navigationFrame.width).toBeCloseTo(8, 0);
  expect(leftFrame.x - filesIconFrame.x - filesIconFrame.width).toBeCloseTo(8, 0);
  expect(rightIconFrame.x - rightFrame.x - rightFrame.width).toBeCloseTo(8, 0);
  expect(visibleViewport.width - rightIconFrame.x - rightIconFrame.width).toBeCloseTo(8, 0);
  expect(toggleFrame.x + toggleFrame.width / 2).toBeCloseTo(
    filesIconFrame.x + filesIconFrame.width / 2,
    0,
  );
}

test.describe("Workspace tool windows", () => {
  test("manages terminal sessions in one retained tool window", async ({
    page,
    withWorkspace,
  }, testInfo) => {
    const workspace = await withWorkspace({ prefix: "terminal-tool-window-" });
    await page.setViewportSize({ width: 1440, height: 960 });
    await gotoWorkspace(page, workspace.workspaceId);
    await waitForWorkspaceTabsVisible(page);
    await page.getByTestId("tool-window-add-bottom").click();
    await page.getByTestId("tool-window-add-bottom-terminal").click();
    const window = page.locator('[data-testid^="tool-window-panel-terminal_"]');
    await expect(window).toBeVisible({ timeout: 30_000 });
    const sessions = page.locator('[data-testid^="workspace-tab-terminal_"]');
    await expect(sessions).toHaveCount(1);
    const first = await sessions.first().getAttribute("data-testid");
    if (!first) throw new Error("Missing terminal session");
    const surface = page.getByTestId("terminal-surface").filter({ visible: true });
    await expect(surface).toBeVisible();
    const firstSurface = await surface.elementHandle();
    await sessions.last().hover();
    await page.getByTestId("terminal-session-new").click();
    await expect(sessions).toHaveCount(2);
    await page.getByTestId("tool-window-add-right").click();
    await expect(page.getByTestId("tool-window-add-right-terminal")).toHaveCount(0);
    await expect(
      page
        .getByTestId("tool-window-add-menu-right")
        .getByRole("menuitem", { name: /Local|Terminal|Claude Code|Codex|OpenCode/ }),
    ).toHaveCount(0);
    await page.keyboard.press("Escape");
    await sessions.last().hover();
    await page.getByTestId("terminal-session-new").click();
    await expect(sessions).toHaveCount(3);
    await expect(sessions).toHaveText(["Local", "Local(2)", "Local(3)"]);
    const firstCloseId = first.replace("workspace-tab-", "terminal-session-close-");
    const firstCloseFrame = page.getByTestId(
      first.replace("workspace-tab-", "terminal-session-close-frame-"),
    );
    await page.mouse.move(10, 10);
    await expect(firstCloseFrame).toHaveCSS("opacity", "0");
    await page.getByTestId(first).hover();
    await expect(firstCloseFrame).toHaveCSS("opacity", "1");
    await page.getByTestId(firstCloseId).hover();
    await expect(page.getByTestId(firstCloseId)).toHaveCSS("width", "20px");
    await expect(page.getByTestId(firstCloseId)).toHaveCSS("border-radius", "9999px");
    await expect(page.getByTestId(firstCloseId)).toHaveCSS(
      "background-color",
      "rgb(215, 217, 222)",
    );
    await page.mouse.move(10, 10);
    await expect(firstCloseFrame).toHaveCSS("opacity", "0");

    await expect(page.getByTestId("terminal-session-overflow")).toHaveCount(0);
    await expect(page.getByTestId("terminal-session-profiles")).toHaveCount(0);
    const last = await sessions.last().getAttribute("data-testid");
    if (!last) throw new Error("Missing last terminal tab");
    const closeFrame = await page
      .getByTestId(last.replace("workspace-tab-", "terminal-session-close-"))
      .boundingBox();
    const addFrame = await page.getByTestId("terminal-session-new").boundingBox();
    if (!closeFrame || !addFrame) throw new Error("Missing terminal tab controls");
    expect(addFrame.x - closeFrame.x - closeFrame.width).toBeGreaterThanOrEqual(0);
    expect(addFrame.x - closeFrame.x - closeFrame.width).toBeLessThanOrEqual(8);
    await page.mouse.move(10, 10);
    await expect(page.getByTestId("terminal-session-new-frame")).toHaveCSS("opacity", "0");
    await sessions.last().hover();
    await expect(page.getByTestId("terminal-session-new-frame")).toHaveCSS("opacity", "1");
    const inset = page.getByTestId("terminal-content-inset").filter({ visible: true });
    await expect(inset).toHaveCSS("padding", "12px");
    await expect(window).toHaveCount(1);
    await expect(page.locator('[data-testid^="tool-window-icon-terminal_"]')).toHaveCount(1);
    await sessions.last().click({ button: "right" });
    const lastId = last.replace("workspace-tab-", "");
    await expect(page.getByTestId(`tool-window-context-${lastId}-close-left`)).toBeVisible();
    await expect(page.getByTestId(`tool-window-context-${lastId}-close-right`)).toBeDisabled();
    await page.keyboard.press("Escape");
    await page.getByTestId(first).click();
    await expect(page.getByTestId(first)).toHaveAttribute("aria-selected", "true");
    await expectSameNode(firstSurface, surface);
    await page.screenshot({ path: testInfo.outputPath("terminal-sessions-bottom.png") });
    const title = window.locator('[data-testid^="tool-window-drag-"]');
    await drag(page, title, page.getByTestId("tool-window-rail-right"));
    await expect(window).toHaveAttribute(
      "data-testid",
      first.replace("workspace-tab-", "tool-window-panel-"),
    );
    await expect(
      page
        .getByTestId("tool-window-rail-right")
        .locator('[data-testid^="tool-window-icon-terminal_"]'),
    ).toHaveCount(1);
    await expectSameNode(firstSurface, surface);
    await page.screenshot({ path: testInfo.outputPath("terminal-session-tabs.png") });
    await page.getByTestId("tool-window-minimize-right").click();
    await expect(window).toBeHidden();
    await page.locator('[data-testid^="tool-window-icon-terminal_"]').click();
    await expectSameNode(firstSurface, surface);
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId(first).click({ button: "middle" });
    await expect(sessions).toHaveCount(2);
    await expect(window).toBeVisible();
    await expect(surface).toHaveCount(1);
    await page.reload();
    await waitForWorkspaceTabsVisible(page);
    await expect(sessions).toHaveCount(2);
    await expect(
      page
        .getByTestId("tool-window-rail-right")
        .locator('[data-testid^="tool-window-icon-terminal_"]'),
    ).toHaveCount(1);
    await page.setViewportSize({ width: 599, height: 900 });
    await expect(page.getByTestId("terminal-session-tabs")).toHaveCount(0);
    await page.setViewportSize({ width: 1440, height: 960 });
    await expect(sessions).toHaveCount(2);
    await expect(window).toHaveCount(1);
    // Keep the same sessions and reduce the available tab width to exercise overflow.
    await page.setViewportSize({ width: 900, height: 900 });
    const overflow = page.getByTestId("terminal-session-overflow");
    await expect(overflow).toBeVisible();
    await page.mouse.move(10, 10);
    const pinnedAdd = page.getByTestId("terminal-session-new");
    await expect(pinnedAdd).toBeVisible();
    await expect(page.getByTestId("terminal-session-new-frame")).toHaveCSS("opacity", "1");
    await pinnedAdd.click();
    await expect(sessions).toHaveCount(3);
    const createdId = await sessions.last().getAttribute("data-testid");
    if (!createdId) throw new Error("Missing terminal created while overflowing");
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByTestId(createdId).click({ button: "middle" });
    await expect(sessions).toHaveCount(2);
    await overflow.click();
    const overflowMenu = page.getByTestId("terminal-session-overflow-menu");
    await expect(overflowMenu.getByRole("menuitem")).toHaveCount(2);
    await page.screenshot({ path: testInfo.outputPath("terminal-overflow-menu.png") });
    const hiddenTabId = await sessions.last().getAttribute("data-testid");
    if (!hiddenTabId) throw new Error("Missing overflow terminal");
    await page.getByTestId(hiddenTabId.replace("workspace-tab-", "terminal-overflow-")).click();
    await expect(page.getByTestId(hiddenTabId)).toHaveAttribute("aria-selected", "true");
    await expect(overflowMenu).toBeHidden();
    await page.screenshot({ path: testInfo.outputPath("terminal-overflow.png") });
  });

  test("keeps multiple panels on each rail and independently minimizes each region", async ({
    page,
    withWorkspace,
  }, testInfo) => {
    const workspace = await withWorkspace({ prefix: "tool-window-regions-" });
    await page.setViewportSize({ width: 1680, height: 1040 });
    await gotoWorkspace(page, workspace.workspaceId);
    await waitForWorkspaceTabsVisible(page);
    const main = page.getByTestId("workspace-pane-main");
    await expect(page.getByTestId("workspace-explorer-toggle")).toHaveCount(0);
    await openFilesPanel(page);
    await expect(
      page.getByTestId("tool-window-rail-left").getByTestId("tool-window-icon-files"),
    ).toBeVisible();
    await expect(
      page.getByTestId("tool-window-rail-left").getByTestId("tool-window-icon-changes_tree"),
    ).toBeVisible();
    await openChangesTreePanel(page);
    await expect(panel(page, "changes_tree")).toBeVisible();
    await expect(panel(page, "files")).toHaveCount(0);
    await openFilesPanel(page);
    const filesIcon = page.getByTestId("tool-window-icon-files");
    await expect(filesIcon).toHaveAttribute("data-state", "active");
    await page.mouse.move(800, 180);
    await filesIcon.hover();
    await expect(page.getByRole("tooltip")).toContainText("Files");
    await page.mouse.move(800, 180);

    await page.getByTestId("tool-window-add-right").click();
    await page.getByTestId("tool-window-add-right-diff").click();
    const diff = page
      .locator('[data-testid^="tool-window-panel-"]')
      .filter({ has: page.getByTestId("working-diff-panel"), visible: true });
    await expect(diff).toBeVisible();
    await expect(filesIcon).toHaveAttribute("data-state", "open");
    await page.getByTestId("tool-window-drag-files").click();
    await expect(filesIcon).toHaveAttribute("data-state", "active");
    await page.getByTestId("tool-window-add-bottom").click();
    await expect(page.getByTestId("tool-window-add-bottom-files")).toHaveCount(0);
    await expect(page.getByTestId("tool-window-add-bottom-changes")).toHaveCount(0);
    await expect(page.getByTestId("tool-window-add-bottom-diff")).toHaveCount(0);
    await page.getByTestId("tool-window-add-bottom-terminal").click();
    const terminal = page
      .locator('[data-testid^="tool-window-panel-terminal_"]')
      .filter({ visible: true });
    await expect(terminal).toBeVisible({ timeout: 30_000 });
    await expect(panel(page, "files")).toBeVisible();
    await expect(diff).toBeVisible();
    await expect(main).toBeVisible();
    const mainFrame = await main.boundingBox();
    const leftFrame = await panel(page, "files").boundingBox();
    const rightFrame = await diff.boundingBox();
    const bottomFrame = await terminal.boundingBox();
    if (!mainFrame || !leftFrame || !rightFrame || !bottomFrame)
      throw new Error("Tool window frames missing");
    expect(mainFrame.x - leftFrame.x - leftFrame.width).toBeGreaterThanOrEqual(7);
    expect(rightFrame.x - mainFrame.x - mainFrame.width).toBeGreaterThanOrEqual(7);
    expect(bottomFrame.y - mainFrame.y - mainFrame.height).toBeGreaterThanOrEqual(7);
    const navigationBottom = await page
      .getByTestId("desktop-navigation-panel")
      .evaluate((element) => element.getBoundingClientRect().bottom);
    expect(bottomFrame.y + bottomFrame.height).toBeCloseTo(navigationBottom, 0);
    await expectVisibleChromeAlignment(page, leftFrame, rightFrame);
    for (const region of ["left", "right"]) {
      const rail = page.getByTestId(`tool-window-rail-${region}`);
      const railFrame = await rail.boundingBox();
      const iconFrame = await rail
        .locator('[data-testid^="tool-window-icon-"]')
        .first()
        .boundingBox();
      if (!railFrame || !iconFrame) throw new Error("Tool rail geometry missing");
      expect(iconFrame.x - railFrame.x).toBeCloseTo(8, 0);
      expect(railFrame.x + railFrame.width - iconFrame.x - iconFrame.width).toBeCloseTo(8, 0);
    }
    const filesBeforeResize = await panel(page, "files").boundingBox();
    const terminalBeforeResize = await terminal.boundingBox();
    const leftHandle = await page.getByTestId("tool-window-resize-left").boundingBox();
    const bottomHandle = await page.getByTestId("tool-window-resize-bottom").boundingBox();
    if (!filesBeforeResize || !terminalBeforeResize || !leftHandle || !bottomHandle)
      throw new Error("Tool window resize geometry missing");
    expect(leftHandle.height).toBeGreaterThan(200);
    await page.mouse.move(leftHandle.x + leftHandle.width / 2, leftHandle.y + 80);
    await page.mouse.down();
    await page.mouse.move(leftHandle.x + 50, leftHandle.y + 80, { steps: 10 });
    await page.mouse.up();
    await expect
      .poll(async () => (await panel(page, "files").boundingBox())?.width)
      .toBeGreaterThan(filesBeforeResize.width + 30);
    await page.mouse.move(bottomHandle.x + bottomHandle.width / 2, bottomHandle.y);
    await page.mouse.down();
    await page.mouse.move(bottomHandle.x + bottomHandle.width / 2, bottomHandle.y - 70, {
      steps: 10,
    });
    await page.mouse.up();
    await expect
      .poll(async () => (await terminal.boundingBox())?.height)
      .toBeGreaterThan(terminalBeforeResize.height + 40);
    const resizedFiles = await panel(page, "files").boundingBox();
    const resizedTerminal = await terminal.boundingBox();
    if (!resizedFiles || !resizedTerminal) throw new Error("Resized tools missing");
    await page.reload();
    await waitForWorkspaceTabsVisible(page);
    await expect
      .poll(async () => Math.round((await panel(page, "files").boundingBox())?.width ?? 0))
      .toBe(Math.round(resizedFiles.width));
    await expect
      .poll(async () => Math.round((await terminal.boundingBox())?.height ?? 0))
      .toBe(Math.round(resizedTerminal.height));
    await expect(panel(page, "files").getByText("README.md", { exact: true })).toBeVisible();
    await expect(diff.getByText("No changes to display", { exact: true })).toBeVisible();
    await page.mouse.move(2, 2);
    await page.screenshot({ path: testInfo.outputPath("three-tool-window-regions.png") });
    const toggleSidebarKey = process.platform === "darwin" ? "Meta+b" : "Control+b";
    await page.keyboard.press(toggleSidebarKey);
    await expect(page.getByTestId("left-sidebar-resize-handle")).toBeHidden();
    const collapsedCanvas = await page.getByTestId("desktop-workspace-canvas").boundingBox();
    const viewport = page.viewportSize();
    if (!collapsedCanvas || !viewport) throw new Error("Collapsed workspace geometry missing");
    expect(viewport.height - collapsedCanvas.y - collapsedCanvas.height).toBeCloseTo(4, 0);
    const collapsedBottom = await terminal.boundingBox();
    if (!collapsedBottom) throw new Error("Collapsed bottom panel missing");
    expect(viewport.height - collapsedBottom.y - collapsedBottom.height).toBeCloseTo(8, 0);
    await page.screenshot({ path: testInfo.outputPath("collapsed-sidebar-tool-regions.png") });
    await page.keyboard.press(toggleSidebarKey);
    await expect(page.getByTestId("left-sidebar-resize-handle")).toBeVisible();

    await page.getByTestId("tool-window-minimize-left").click();
    await expect(panel(page, "files")).toHaveCount(0);
    await expect(diff).toBeVisible();
    await expect(terminal).toBeVisible();
    await page.getByTestId("tool-window-minimize-right").click();
    await expect(diff).toHaveCount(0);
    await expect(terminal).toBeVisible();
    await page.getByTestId("tool-window-icon-files").click();
    await expect(panel(page, "files")).toBeVisible();
    await page.getByTestId("tool-window-minimize-bottom").click();
    await expect(terminal).toHaveCount(0);
    await expect(page.locator('[data-testid^="tool-window-icon-terminal_"]')).toBeVisible();
  });

  test("drags icons and panel headers through all three regions while retaining content", async ({
    page,
    withWorkspace,
  }, testInfo) => {
    const workspace = await withWorkspace({ prefix: "tool-window-drag-" });
    await page.setViewportSize({ width: 1440, height: 960 });
    await gotoWorkspace(page, workspace.workspaceId);
    await waitForWorkspaceTabsVisible(page);
    await openFilesPanel(page);
    const files = panel(page, "files");
    const tree = files.getByTestId("file-explorer-tree-scroll");
    const original = await tree.elementHandle();
    await drag(
      page,
      page.getByTestId("tool-window-icon-files"),
      page.getByTestId("tool-window-rail-right"),
    );
    await expect(
      page.getByTestId("tool-window-rail-right").getByTestId("tool-window-icon-files"),
    ).toBeVisible();
    await expect(files.locator('[data-region="right"]')).toBeVisible();
    await expectSameNode(original, tree);
    await drag(page, page.getByTestId("tool-window-icon-changes_tree"), files);
    await expect(
      page.getByTestId("tool-window-rail-right").getByTestId("tool-window-icon-changes_tree"),
    ).toBeVisible();
    await expect(panel(page, "changes_tree")).toBeVisible();
    await page.getByTestId("tool-window-icon-files").click();
    await expectSameNode(original, tree);

    await drag(
      page,
      page.getByTestId("tool-window-drag-files"),
      page.getByTestId("tool-window-rail-bottom"),
    );
    await expect(
      page.getByTestId("tool-window-rail-bottom").getByTestId("tool-window-icon-files"),
    ).toBeVisible();
    await expect(files.locator('[data-region="bottom"]')).toBeVisible();
    await expectSameNode(original, tree);
    await page.getByTestId("tool-window-minimize-bottom").click();
    await expect(files).toHaveCount(0);
    await page.getByTestId("tool-window-icon-files").click();
    await expectSameNode(original, tree);
    await page.screenshot({ path: testInfo.outputPath("file-panel-at-bottom.png") });

    await page.reload();
    await waitForWorkspaceTabsVisible(page);
    await expect(files.locator('[data-region="bottom"]')).toBeVisible();
    await expect(
      page.getByTestId("tool-window-rail-bottom").getByTestId("tool-window-icon-files"),
    ).toBeVisible();
    await page.getByTestId("tool-window-minimize-bottom").click();
    await page.reload();
    await waitForWorkspaceTabsVisible(page);
    await expect(files).toHaveCount(0);
    await page.getByTestId("tool-window-icon-files").click();
    await expect(tree).toBeVisible();
  });
});
