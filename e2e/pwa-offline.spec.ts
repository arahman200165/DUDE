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

// ngsw-config.json prefetches only the app shell. A tool visit must add its lazy
// chunks to Cache Storage, after which the route remains available offline.
test('a tool visit lazily caches its chunks and remains offline-capable after reload', async ({
  page,
  context,
}) => {
  await page.goto('/DUDE/');
  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 35_000 });

  const cachedChunks = () => page.evaluate(async () => {
    const names = await caches.keys();
    const urls = (await Promise.all(names.map(async (name) => {
      const cache = await caches.open(name);
      return (await cache.keys()).map((request) => request.url);
    }))).flat();
    return urls.filter((url) => /\/DUDE\/chunk-[^/]+\.js$/.test(url));
  });
  const beforeVisit = new Set(await cachedChunks());

  // Visiting it once online is what actually triggers the lazy chunk fetch (and, per the
  // "tool-chunks" group's installMode: lazy, its caching).
  await page.goto('/DUDE/tools/base64');
  await expect(page.getByRole('heading', { name: 'Base64 Encoder / Decoder' })).toBeVisible();
  await expect.poll(async () => (await cachedChunks()).filter((url) => !beforeVisit.has(url)).length).toBeGreaterThan(0);

  await context.setOffline(true);
  try {
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Base64 Encoder / Decoder' })).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
});
