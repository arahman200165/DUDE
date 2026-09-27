import { expect, test } from '@playwright/test';

// Browser-Safe Workspace Support (DUDE_PRD.md §21 Phase 26 Item 14) against the production build:
// a second open tab sees a pipeline saved in the first one without reloading, and an exported
// bundle restores a wiped browser profile through the two-step import.

const PIPELINES_KEY = 'dude:v1:__pipelines__:saved';
const store = (name: string) =>
  JSON.stringify({
    schemaVersion: 1,
    pipelines: [
      {
        schemaVersion: 1,
        id: `id-${name}`,
        name,
        steps: [{ kind: 'tool', stepId: 's1', toolId: 'json' }],
        createdAt: '2026-09-27T00:00:00.000Z',
        updatedAt: '2026-09-27T00:00:00.000Z',
      },
    ],
  });

test('a pipeline saved in one tab appears live in another open tab', async ({ context }) => {
  const tabA = await context.newPage();
  await tabA.goto('/DUDE/pipelines');
  await expect(tabA.locator('app-pipeline-list')).toBeVisible();

  const tabB = await context.newPage();
  await tabB.goto('/DUDE/');
  await tabB.evaluate(([key, value]) => localStorage.setItem(key, value), [PIPELINES_KEY, store('Saved in tab B')]);

  await expect(tabA.locator('app-pipeline-list')).toContainText('Saved in tab B');
});

test('export a bundle, wipe the profile, and restore it through the two-step import', async ({ page }) => {
  // Force the plain-download fallback so the test never opens a native Save dialog.
  await page.addInitScript(() => delete (window as { showSaveFilePicker?: unknown }).showSaveFilePicker);
  await page.goto('/DUDE/');
  await page.evaluate(([key, value]) => localStorage.setItem(key, value), [PIPELINES_KEY, store('Backed up')]);

  await page.goto('/DUDE/settings/data');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export bundle…' }).click()]);
  const bundlePath = await download.path();
  expect(download.suggestedFilename()).toMatch(/^dude-bundle-\d{4}-\d{2}-\d{2}\.json$/);

  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByTestId('bundle-file').setInputFiles(bundlePath);
  await expect(page.getByTestId('import-preview')).toContainText('1 pipeline(s)');
  expect(await page.evaluate((key) => localStorage.getItem(key), PIPELINES_KEY)).not.toContain('Backed up');

  await page.getByRole('button', { name: 'Import', exact: true }).click();
  await page.goto('/DUDE/pipelines');
  await expect(page.locator('app-pipeline-list')).toContainText('Backed up');
});
