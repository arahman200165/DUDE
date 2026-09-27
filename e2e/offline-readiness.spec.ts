import { Page, expect, test } from '@playwright/test';

// Phase 26 (DUDE_PRD.md §21) Items 3, 5, and 10 against the real production build and the stock
// Angular service worker: an uncached tool degrades to an explanation offline instead of a blank
// route, an optional WASM runtime is cached only on demand and can be cleared through a two-step
// preview/confirm, and Repair wipes only the service worker's caches, never user data.

async function waitForServiceWorker(page: Page): Promise<void> {
  await page.goto('/DUDE/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 35_000 });
}

const cachedUrls = (page: Page, pattern: string) =>
  page.evaluate(async (source) => {
    const regex = new RegExp(source);
    const urls: string[] = [];
    for (const name of await caches.keys()) {
      for (const request of await (await caches.open(name)).keys()) if (regex.test(request.url)) urls.push(request.url);
    }
    return urls;
  }, pattern);

test('offline, a never-visited tool explains itself and is dimmed; a visited one still opens', async ({ page, context }) => {
  await waitForServiceWorker(page);
  await page.goto('/DUDE/tools/base64');
  await expect(page.getByRole('heading', { name: 'Base64 Encoder / Decoder' })).toBeVisible();
  await page.goto('/DUDE/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await context.setOffline(true);
  try {
    // Dimming needs the map + a cache scan, which the readiness service runs on going offline.
    const sidebar = page.locator('app-sidebar');
    await expect(sidebar.locator('a[href="/DUDE/tools/python-playground"]')).toHaveAttribute('data-offline-unavailable', 'true');
    await expect(sidebar.locator('a[href="/DUDE/tools/base64"]')).not.toHaveAttribute('data-offline-unavailable', 'true');

    await sidebar.locator('a[href="/DUDE/tools/python-playground"]').click();
    await expect(page.getByRole('alert')).toContainText('Not available offline yet');

    await sidebar.locator('a[href="/DUDE/tools/base64"]').click();
    await expect(page.getByRole('heading', { name: 'Base64 Encoder / Decoder' })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

test('an optional WASM runtime is not prefetched, downloads on demand, and clears only after Confirm', async ({ page }) => {
  await waitForServiceWorker(page);
  expect(await cachedUrls(page, '/assets/vendor/sql\\.js/')).toEqual([]);

  await page.goto('/DUDE/settings/web-companion');
  const row = page.locator('tr[data-runtime="sqljs"]');
  await row.getByRole('button', { name: 'Download…' }).click();
  await expect(page.getByTestId('download-preview')).toContainText('sql.js');
  expect(await cachedUrls(page, '/assets/vendor/sql\\.js/')).toEqual([]);
  await page.getByRole('button', { name: 'Download', exact: true }).click();
  await expect.poll(() => cachedUrls(page, '/assets/vendor/sql\\.js/')).toHaveLength(1);

  await row.getByRole('button', { name: 'Clear…' }).click();
  await expect(page.getByTestId('action-preview')).toContainText('sql.js');
  expect(await cachedUrls(page, '/assets/vendor/sql\\.js/')).toHaveLength(1);
  await page.getByRole('button', { name: 'Confirm clear' }).click();
  await expect.poll(() => cachedUrls(page, '/assets/vendor/sql\\.js/')).toEqual([]);
});

test('Repair installation clears service-worker caches but keeps saved data', async ({ page }) => {
  await waitForServiceWorker(page);
  await page.evaluate(() => localStorage.setItem('dude:v1:e2e:probe', '"kept"'));

  await page.goto('/DUDE/settings/web-companion');
  await page.getByRole('button', { name: 'Repair installation…' }).click();
  await expect(page.getByTestId('action-preview')).toContainText('History are kept');
  await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Confirm repair' }).click()]);

  expect(await page.evaluate(() => localStorage.getItem('dude:v1:e2e:probe'))).toBe('"kept"');
  // The reload re-registers a fresh worker, which reinstalls the shell from scratch.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 35_000 });
});
