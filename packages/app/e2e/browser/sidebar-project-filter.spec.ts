import { expect } from "@playwright/test";
import { test } from "../support/fixtures";
import { gotoAppShell } from "../support/helpers/app";
import { seedWorkspace } from "../support/helpers/seed-client";
import { getServerId } from "../support/helpers/server-id";
import {
  closeSidebarDisplayPreferences,
  openSidebarProjectFilter,
  pinWorkspaceFromSidebar,
  selectAllProjectsFilter,
  selectSidebarStatusGrouping,
  toggleProjectFilter,
} from "../support/helpers/sidebar";

test.describe("Sidebar project filter", () => {
  test.describe.configure({ timeout: 180_000 });

  test("pins the sidebar to one project across both grouping modes", async ({ page }) => {
    // Two repos expose the project filter alongside the recency filter.
    const alpha = await seedWorkspace({ repoPrefix: "project-filter-alpha-", title: "Alpha work" });
    const beta = await seedWorkspace({ repoPrefix: "project-filter-beta-", title: "Beta work" });
    const serverId = getServerId();
    const alphaRow = page.getByTestId(`sidebar-workspace-row-${serverId}:${alpha.workspaceId}`);
    const betaRow = page.getByTestId(`sidebar-workspace-row-${serverId}:${beta.workspaceId}`);

    try {
      await gotoAppShell(page);
      await page.getByTestId("sidebar-filters-trigger").click();
      await page.getByTestId("sidebar-recency-filter-all").click();
      await page.getByTestId("sidebar-filters-trigger").click();
      await expect(alphaRow).toBeVisible({ timeout: 30_000 });
      await expect(betaRow).toBeVisible({ timeout: 30_000 });
      const footer = page.getByTestId("sidebar-footer");
      await expect(footer.getByTestId("sidebar-filters-trigger")).toBeVisible();
      await expect(footer.getByTestId("sidebar-display-preferences-menu")).toBeVisible();
      await expect(page.getByTestId("sidebar-filters-content")).toHaveCount(0);

      await page.getByTestId("sidebar-filters-trigger").click();
      await expect(page.getByTestId("sidebar-recency-1")).toBeVisible();
      await page.screenshot({ path: test.info().outputPath("sidebar-filter-recency.png") });
      await openSidebarProjectFilter(page);
      await expect(page.getByTestId("sidebar-recency-1")).toBeVisible();
      await expect(
        page.getByTestId(`sidebar-project-filter-${alpha.projectKey}-icon`),
      ).toBeVisible();
      await expect(page.getByTestId("sidebar-project-filter-all")).toBeVisible();
      await expect(page.getByTestId(`sidebar-project-filter-${beta.projectKey}`)).toBeVisible();
      await toggleProjectFilter(page, alpha.projectKey);
      await closeSidebarDisplayPreferences(page);

      await expect(alphaRow).toBeVisible();
      await expect(betaRow).toHaveCount(0, { timeout: 10_000 });

      // Collapsing preserves the filter without showing its selected values.
      await expect(page.getByTestId("sidebar-filter-summary")).toHaveCount(0);
      await page.screenshot({ path: test.info().outputPath("sidebar-filter-summary.png") });
      await openSidebarProjectFilter(page);
      await page.screenshot({ path: test.info().outputPath("sidebar-filter-panel.png") });
      await closeSidebarDisplayPreferences(page);

      // Status grouping builds its rows from the workspace entries rather than the projects
      // array, so a filter applied in only one of the two places passes every check above and
      // silently fails right here.
      await selectSidebarStatusGrouping(page);
      await closeSidebarDisplayPreferences(page);
      await expect(alphaRow).toBeVisible({ timeout: 15_000 });
      await expect(betaRow).toHaveCount(0);

      // The filter is view state and survives a cold load.
      await page.reload();
      await expect(alphaRow).toBeVisible({ timeout: 30_000 });
      await expect(betaRow).toHaveCount(0);

      await openSidebarProjectFilter(page);
      await selectAllProjectsFilter(page);
      await closeSidebarDisplayPreferences(page);
      await expect(alphaRow).toBeVisible();
      await expect(betaRow).toBeVisible({ timeout: 15_000 });
    } finally {
      await beta.cleanup();
      await alpha.cleanup();
    }
  });

  test("keeps the display menu reachable when the pinned section swallows the filtered project", async ({
    page,
  }) => {
    // Pinning hoists a chat out of its project, and a project whose chats are ALL hoisted is
    // dropped from the project list entirely. Filter to that project and the list body has no
    // project rows left — so the header, which carries the only route back to the filter page,
    // has to survive on the strength of the filter alone.
    const alpha = await seedWorkspace({
      repoPrefix: "project-filter-pinned-",
      title: "Pinned work",
    });
    const beta = await seedWorkspace({ repoPrefix: "project-filter-other-", title: "Other work" });
    const serverId = getServerId();
    const alphaRow = page.getByTestId(`sidebar-workspace-row-${serverId}:${alpha.workspaceId}`);

    try {
      await gotoAppShell(page);
      await page.getByTestId("sidebar-filters-trigger").click();
      await page.getByTestId("sidebar-recency-filter-all").click();
      await page.getByTestId("sidebar-filters-trigger").click();
      await expect(alphaRow).toBeVisible({ timeout: 30_000 });

      await openSidebarProjectFilter(page);
      await toggleProjectFilter(page, alpha.projectKey);
      await closeSidebarDisplayPreferences(page);

      await pinWorkspaceFromSidebar(page, alpha.workspaceId);
      await expect(alphaRow).toBeVisible();

      // The way out of the filter is still on screen.
      await expect(page.getByTestId("sidebar-display-preferences-menu")).toBeVisible();
      await openSidebarProjectFilter(page);
      await selectAllProjectsFilter(page);
      await closeSidebarDisplayPreferences(page);
      await expect(
        page.getByTestId(`sidebar-workspace-row-${serverId}:${beta.workspaceId}`),
      ).toBeVisible({ timeout: 15_000 });
    } finally {
      await beta.cleanup();
      await alpha.cleanup();
    }
  });

  test("hides the filter row when there is only one project", async ({ page }) => {
    const only = await seedWorkspace({ repoPrefix: "project-filter-solo-", title: "Solo work" });
    const serverId = getServerId();

    try {
      await gotoAppShell(page);
      await page.getByTestId("sidebar-filters-trigger").click();
      await page.getByTestId("sidebar-recency-filter-all").click();
      await page.getByTestId("sidebar-filters-trigger").click();
      await expect(
        page.getByTestId(`sidebar-workspace-row-${serverId}:${only.workspaceId}`),
      ).toBeVisible({ timeout: 30_000 });

      await page.getByTestId("sidebar-filters-trigger").click();
      await expect(page.getByTestId("sidebar-filter-project")).toHaveCount(0);
    } finally {
      await only.cleanup();
    }
  });
});
