import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';

const tools = [
  ['base64', 'Base64 Encoder / Decoder'],
  ['hash', 'Hash Generator'],
  ['html-entities', 'HTML Entity Encoder / Decoder'],
  ['sqlite-viewer', 'SQLite File Viewer'],
  ['html-preview', 'HTML Preview'],
  ['process-viewer', 'Process Viewer'],
] as const;

for (const [id, title] of tools) {
  test(`portable extraction preserves hard navigation and refresh: ${id}`, async ({ page }) => {
    await page.goto(`/DUDE/tools/${id}`);
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.locator('app-sidebar')).toBeVisible();
  });
}

test('the production renderer reads the independent SQLite fixture through WASM', async ({ page }) => {
  await page.goto('/DUDE/tools/sqlite-viewer');
  await page.locator('input[type=file]').setInputFiles(resolve('apps/web/src/app/tools/sqlite-viewer/__fixtures__/golden.sqlite'));
  await page.getByRole('button', { name: 'employees', exact: true }).click();
  await expect(page.locator('app-data-table')).toContainText('Ada Lovelace');
  await expect(page.locator('app-data-table')).toContainText('Grace Hopper');
});

for (const route of ['pipelines', 'projects', 'workspace', 'settings/appearance']) {
  test(`workbench route survives a fresh load and refresh: ${route}`, async ({ page }) => {
    await page.goto(`/DUDE/${route}`);
    await expect(page).toHaveURL(`/DUDE/${route}`);
    await page.reload();
    await expect(page).toHaveURL(`/DUDE/${route}`);
    await expect(page.locator('app-sidebar')).toBeVisible();
    await expect(page.getByText('Page not found', { exact: true })).not.toBeVisible();
  });
}
