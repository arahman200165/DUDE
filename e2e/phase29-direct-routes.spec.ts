import { expect, test } from '@playwright/test';

const routes = [
  ['batch-operations', 'Batch Operations'],
  ['folder-size-analyzer', 'Folder Size Analyzer'],
  ['directory-tree-generator', 'Directory Tree Generator'],
  ['hash-manifest', 'Hash Manifest & Snapshot'],
  ['duplicate-files', 'Duplicate Files'],
  ['tree-search', 'Tree Search'],
  ['batch-rename', 'Batch Rename'],
  ['batch-text-converter', 'Batch Text Converter'],
  ['file-split-join', 'File Split & Join'],
  ['large-file-inspector', 'Large-File Streaming Inspector'],
  ['watched-folders', 'Watched Folders & Change Timeline'],
  ['directory-diff', 'Directory Diff'],
  ['git-diff', 'Git Repo Browser'],
] as const;

for (const [id, title] of routes) {
  test('Phase 29 direct route: ' + id, async ({ page }) => {
    await page.goto('/DUDE/tools/' + id);
    await expect(page).toHaveURL(new RegExp('/DUDE/tools/' + id + '$'));
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.locator('app-desktop-only-control button').first()).toBeVisible();
    await expect(page.locator('app-sidebar')).toBeVisible();
  });
}

test('Phase 29 tools appear in Browse Tools search and command palette', async ({ page }) => {
  await page.goto('/DUDE/tools');
  await page.locator('app-browse-tools').getByPlaceholder(/Search tools/).fill('Watched Folders');
  await expect(page.locator('app-browse-tools').getByRole('link', { name: 'Watched Folders & Change Timeline' })).toBeVisible();
  await page.keyboard.press('Control+k');
  const palette = page.locator('app-command-palette');
  await palette.getByPlaceholder(/Search tools/).fill('Tree Search');
  await expect(palette.getByRole('button', { name: 'Tree Search' })).toBeVisible();
});
