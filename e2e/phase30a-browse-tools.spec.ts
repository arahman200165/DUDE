import { expect, test } from '@playwright/test';

// Browse Tools direct route (DUDE_PRD.md §21 Phase 30A.1/30A.8) -- the ninth sanctioned shell
// exception. A fresh production hard-navigation must render the full catalog with the shell intact,
// exactly like every other shell destination's own direct-route test.

test('Browse Tools direct route renders the full catalog with the shell intact', async ({ page }) => {
  await page.goto('/DUDE/tools');
  await expect(page).toHaveURL(/\/DUDE\/tools$/);
  await expect(page.getByRole('heading', { name: 'Browse Tools' })).toBeVisible();
  await expect(page.locator('app-sidebar')).toBeVisible();
  await expect(page.locator('app-tool-table [role="row"]').first()).toBeVisible();
});

test('Browse Tools search narrows the catalog and updates the URL', async ({ page }) => {
  await page.goto('/DUDE/tools');
  await page.getByPlaceholder(/Search tools/).fill('json formatter');
  await expect(page.locator('app-tool-table a', { hasText: 'JSON Formatter' })).toBeVisible();
  await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('json formatter');
});

test('Browse Tools switches to Grid view and persists it across a reload', async ({ page }) => {
  await page.goto('/DUDE/tools');
  await page.getByRole('radio', { name: 'Grid' }).click();
  await expect(page.locator('app-tool-grid')).toBeVisible();
  await page.reload();
  await expect(page.locator('app-tool-grid')).toBeVisible();
});
