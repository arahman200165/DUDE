import { expect, test } from '@playwright/test';

// Verifies the PWA/offline smoke requirement: after the service worker has
// installed and activated on a first successful load, the cached app shell
// still renders once the network is cut — not just that the app works
// online.
test('the cached app shell still renders after going offline', async ({ page, context }) => {
  await page.goto('/DUDE/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 35_000 });

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    await expect(page.locator('app-sidebar')).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});

// DUDE_PRD.md §21 Phase 22 Items 8/9 — ngsw-config.json's "app" group only prefetches the
// shell (main bundle/styles/index.html), not every tool's lazy chunk; each tool's own chunk
// is cached lazily, the first time its route is actually visited. Regression-guards the exact
// bug this milestone fixed: previously "app" globbed every "*.js" output (all 277+ lazy tool
// chunks) with installMode: prefetch, caching the entire app upfront regardless of visits.
test('a tool route not yet visited is not cached, and becomes cached (and offline-capable) after one visit', async ({
  page,
  context,
}) => {
  await page.goto('/DUDE/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 35_000 });

  // Never-visited tool route, offline: the app shell itself still loads (SPA navigation
  // fallback serves cached index.html for any app URL), but the tool's own lazy chunk was
  // never fetched/cached, so it can't actually render.
  await context.setOffline(true);
  await page.goto('/DUDE/tools/base64');
  await expect(page.getByRole('heading', { name: 'Base64 Encoder / Decoder' })).not.toBeVisible();
  await context.setOffline(false);

  // Visiting it once online is what actually triggers the lazy chunk fetch (and, per the
  // "tool-chunks" group's installMode: lazy, its caching).
  await page.goto('/DUDE/tools/base64');
  await expect(page.getByRole('heading', { name: 'Base64 Encoder / Decoder' })).toBeVisible();

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Base64 Encoder / Decoder' })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
