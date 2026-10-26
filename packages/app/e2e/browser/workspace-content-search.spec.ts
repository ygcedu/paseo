import { access } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "../support/fixtures";
import { gotoWorkspace } from "../support/helpers/launcher";
import { seedWorkspace } from "../support/helpers/seed-client";

const FILE_PATH = "src/nested/search-target.ts";
test("searches contents and opens the matching line with its directory tree", async ({ page }) => {
  test.setTimeout(120_000);
  const seeded = await seedWorkspace({
    repoPrefix: "workspace-content-search-",
    title: "Workspace content search",
    repo: {
      files: [
        {
          path: FILE_PATH,
          content:
            "// first line\nexport const searchNeedle = '你好😀';\n// final line\nexport const nextNeedle = true;\n",
        },
        { path: "src/other.ts", content: "export const unrelated = true;\n" },
        ...Array.from({ length: 80 }, (_, index) => ({
          path: `src/nested/aaa-${String(index).padStart(3, "0")}.ts`,
          content: "export const unrelated = true;\n",
        })),
      ],
    },
  });
  try {
    await gotoWorkspace(page, seeded.workspaceId);
    await page.getByTestId("workspace-search-button").click();
    const dialog = page.getByTestId("workspace-search-dialog");
    await expect(dialog).toBeVisible();
    await page.getByTestId("workspace-search-input").fill("searchNeedle");
    const result = page.getByTestId("workspace-search-result");
    await expect(result).toHaveCount(1);
    await expect(result).toHaveAttribute("aria-label", `${FILE_PATH}:2`);
    await page.screenshot({ path: "test-results/workspace-content-search-results.png" });
    await page.getByTestId("workspace-search-input").fill("no-such-text-in-this-workspace");
    await expect(result).toHaveCount(0);
    await expect(dialog).toContainText("Matches: 0");
    await page.getByTestId("workspace-search-input").fill("searchNeedle");
    await expect(result).toHaveCount(1);
    await page.getByTestId("workspace-search-filter-toggle").click();
    await page.getByTestId("workspace-search-filter").fill("*.md");
    await expect(result).toHaveCount(0);
    await page.getByTestId("workspace-search-filter").fill("*.ts");
    await expect(result).toHaveCount(1);
    await page.getByTestId("workspace-search-input").fill("[");
    await page.getByRole("button", { name: "Use regular expression", exact: true }).click();
    await expect(dialog).toContainText("regex parse error");
    await page.getByRole("button", { name: "Use regular expression", exact: true }).click();
    await page.getByTestId("workspace-search-input").fill("searchNeedle");
    await expect(result).toHaveCount(1);
    await result.click();
    await expect(dialog).toBeHidden();
    const rail = page.getByTestId("workspace-explorer-sidebar");
    await expect(rail).toBeVisible();
    await expect(page.getByTestId("workspace-explorer-sidebar")).toBeVisible();
    await expect(page.getByTestId("file-tree-rail")).toHaveCount(0);
    await expect(page.locator(".cm-content").filter({ hasText: "searchNeedle" })).toBeVisible();
    await expect(page.getByText("Ln 2, Col 1", { exact: true })).toBeVisible();
    await expect(rail.getByText("search-target.ts", { exact: true }).first()).toBeInViewport();
    await page.screenshot({ path: "test-results/workspace-content-search-open-file.png" });
    const editor = page.locator(".cm-content").filter({ hasText: "searchNeedle" });
    const treeBounds = await page.getByTestId("file-explorer-tree-scroll").boundingBox();
    const editorBounds = await editor.boundingBox();
    expect(treeBounds).not.toBeNull();
    expect(editorBounds).not.toBeNull();
    expect(treeBounds!.x + treeBounds!.width).toBeLessThanOrEqual(editorBounds!.x);
    await editor.evaluate((node) => node.setAttribute("data-search-editor-instance", "original"));
    await page
      .getByTestId("tool-window-panel-files")
      .getByTestId("tool-window-minimize-left")
      .click();
    await expect(page.getByTestId("file-explorer-tree-scroll")).toBeHidden();

    await expect(editor).toHaveAttribute("data-search-editor-instance", "original");
    await page.getByTestId("workspace-search-button").click();
    await page.getByTestId("workspace-search-input").fill("nextNeedle");
    await page.getByTestId("workspace-search-result").click();
    await expect(page.getByText("Ln 4, Col 1", { exact: true })).toBeVisible();
    await expect(page.getByTestId("workspace-explorer-sidebar")).toBeVisible();
    await expect(page.getByTestId("file-tree-rail")).toHaveCount(0);
    await expect(editor).toHaveAttribute("data-search-editor-instance", "original");
    await expect(rail.getByText("search-target.ts", { exact: true }).first()).toBeInViewport();
    await editor.press("ArrowUp");
    await editor.press("ArrowUp");
    await editor.press("ArrowUp");
    await expect(page.getByText("Ln 1, Col 1", { exact: true })).toBeVisible();
    await page
      .getByTestId("file-explorer-tree-scroll")
      .evaluate((element) => element.scrollTo({ top: 0 }));
    await page.getByTestId("workspace-search-button").click();
    await page.getByTestId("workspace-search-input").fill("nextNeedle");
    await page.getByTestId("workspace-search-result").click();
    await expect(page.getByText("Ln 4, Col 1", { exact: true })).toBeVisible();
    await expect(rail.getByText("search-target.ts", { exact: true }).first()).toBeInViewport();
  } finally {
    await seeded.cleanup();
  }
});

test("content search opens a file from the compact workspace header", async ({ page }) => {
  const seeded = await seedWorkspace({
    repoPrefix: "workspace-content-search-compact-",
    title: "Compact search",
    repo: { files: [{ path: "compact.ts", content: "export const compactNeedle = true;\n" }] },
  });
  try {
    await gotoWorkspace(page, seeded.workspaceId);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId("workspace-search-button").click();
    await page.getByTestId("workspace-search-input").fill("compactNeedle");
    await page.getByTestId("workspace-search-result").click();
    await expect(page.getByTestId("workspace-search-dialog")).toBeHidden();
    await expect(page.locator(".cm-content").filter({ hasText: "compactNeedle" })).toBeVisible();
    await page.screenshot({ path: "test-results/workspace-content-search-compact.png" });
  } finally {
    await seeded.cleanup();
  }
});

for (const theme of ["light", "dark"] as const) {
  test(`grouped search is readable and keyboard accessible in ${theme}`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.addInitScript((selectedTheme) => {
      localStorage.setItem(
        "@paseo:app-settings",
        JSON.stringify({ theme: selectedTheme, language: "zh-CN" }),
      );
    }, theme);
    const seeded = await seedWorkspace({
      repoPrefix: "search-design-",
      title: "Paseo",
      repo: {
        files: [
          {
            path: "src/components/search-button.tsx",
            content:
              "import { useState } from 'react';\nexport function SearchButton() {\n  const [query, setQuery] = useState('');\n  return <button onClick={() => setQuery('搜索')}>Search files</button>;\n}\n",
          },
          {
            path: "src/workspace/search-results.ts",
            content:
              "export interface SearchResult {\n  path: string;\n  line: number;\n}\nexport function groupSearchResults(matches: SearchResult[]) {\n  return new Map(matches.map(match => [match.path, match]));\n}\n",
          },
          {
            path: "packages/app/src/features/workspace/search/long-directory-name-for-truncation/search-navigation.ts",
            content:
              "// Search navigation keeps the editor focused.\nexport const searchDebounceMs = 150;\nexport const searchResultLimit = 1000;\n",
          },
        ],
      },
    });
    try {
      await gotoWorkspace(page, seeded.workspaceId);
      await page.getByTestId("workspace-search-button").click();
      const input = page.getByTestId("workspace-search-input");
      const dialog = page.getByTestId("workspace-search-dialog");
      await expect(input).toBeFocused();
      await expect(page.getByTestId("workspace-search-filter")).toBeHidden();
      await input.fill("Search");
      const results = page.getByTestId("workspace-search-result");
      await expect(results).toHaveCount(7);
      await expect(page.getByTestId("workspace-search-file-group")).toHaveCount(3);
      await expect(results.first()).toHaveAttribute("aria-selected", "true");
      await input.press("ArrowDown");
      await expect(results.nth(1)).toHaveAttribute("aria-selected", "true");
      await input.press("ArrowUp");
      await expect(results.first()).toHaveAttribute("aria-selected", "true");
      await page.screenshot({ path: `/tmp/paseo-search-qa/${theme}-results.png` });
      await input.press("ArrowUp");
      await expect(results.last()).toHaveAttribute("aria-selected", "true");
      await expect(results.last()).toBeInViewport();
      await page.screenshot({ path: `/tmp/paseo-search-qa/${theme}-long-path.png` });
      await input.press("ArrowDown");
      await expect(results.first()).toHaveAttribute("aria-selected", "true");
      await page.getByTestId("workspace-search-clear").click();
      await expect(input).toHaveValue("");
      await expect(input).toBeFocused();
      await expect(results).toHaveCount(0);
      await input.fill("搜索");
      await expect(results).toHaveCount(1);
      await expect(results).toContainText("搜索");
      await input.fill("no-result-needle");
      await expect(page.getByTestId("workspace-search-empty")).toContainText("没有结果");
      await page.screenshot({ path: `/tmp/paseo-search-qa/${theme}-empty.png` });
      await input.fill("Search");
      await expect(results).toHaveCount(7);
      await input.press("ArrowDown");
      const target = await results.nth(1).getAttribute("aria-label");
      const line = target?.split(":").at(-1);
      await input.evaluate((element) =>
        element.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Enter", isComposing: true, bubbles: true }),
        ),
      );
      await expect(dialog).toBeVisible();
      await input.press("Enter");
      await expect(dialog).toBeHidden();
      await expect(page.getByText(`Ln ${line}, Col 1`, { exact: true })).toBeVisible();
      await expect(page.getByTestId("workspace-explorer-sidebar")).toBeVisible();
      await expect(page.getByTestId("file-tree-rail")).toHaveCount(0);
      await page.screenshot({ path: `/tmp/paseo-search-qa/${theme}-file.png` });
      await page.getByTestId("workspace-search-button").click();
      await page.getByTestId("workspace-search-input").press("Escape");
      await expect(dialog).toBeHidden();
      expect(errors).toEqual([]);
    } finally {
      await seeded.cleanup();
    }
  });
}

test("bounds terminal search results, keeps query text literal, and cleans up tasks", async ({
  page,
}) => {
  const literal = "你好😀$(touch search-injection) ' \" ;";
  const seeded = await seedWorkspace({
    repoPrefix: "workspace-content-search-terminal-",
    title: "Search task cleanup",
    repo: {
      files: [
        { path: "literal.ts", content: `// ${literal}\n` },
        {
          path: "many.ts",
          content: Array.from({ length: 1200 }, () => "// boundedNeedle\n").join(""),
        },
      ],
    },
  });
  const remainingTerminals = async () =>
    (
      await seeded.client.listTerminals(seeded.workspaceDirectory, undefined, {
        workspaceId: seeded.workspaceId,
      })
    ).terminals;
  try {
    await gotoWorkspace(page, seeded.workspaceId);
    await page.getByTestId("workspace-search-button").click();
    const input = page.getByTestId("workspace-search-input");
    await input.fill("boundedNeedle");
    await expect(page.getByTestId("workspace-search-dialog")).toContainText("Results limited.");
    await expect.poll(remainingTerminals).toEqual([]);
    await expect(page.getByTestId("terminal-session-tabs")).toHaveCount(0);
    await input.fill(literal);
    await expect(page.getByTestId("workspace-search-result")).toHaveCount(1);
    await expect(page.getByTestId("workspace-search-result")).toHaveAttribute(
      "aria-label",
      "literal.ts:1",
    );
    await expect.poll(remainingTerminals).toEqual([]);
    await expect(access(join(seeded.repoPath, "search-injection"))).rejects.toThrow();
    await input.fill("boundedNeedle");
    await input.press("Escape");
    await expect.poll(remainingTerminals).toEqual([]);
  } finally {
    await seeded.cleanup();
  }
});
