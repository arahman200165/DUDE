import { Page, expect, test } from '@playwright/test';

// GitHub Pages direct-route recovery (DUDE_PRD.md §10, §21 Phase 26 Item 11). A cold hit on a deep
// URL goes through public/404.html → index.html's decode script → the Angular router. A
// SW-controlled hit is served index.html directly by ngsw. Either way the final URL must equal
// what was requested, including query and fragment. Share links (Item 12) carry tool input in the
// fragment, so fragment fidelity is load-bearing, not cosmetic.

const CASES: readonly { name: string; url: string; expected?: string }[] = [
  { name: 'plain tool route', url: '/DUDE/tools/json' },
  { name: 'query with several params', url: '/DUDE/history?tool=json&limit=5' },
  { name: 'fragment', url: '/DUDE/tools/base64#section-2' },
  { name: 'share-link fragment', url: '/DUDE/tools/base64#in=v1.q1YqS8wpTVWyUsrPS1WqBQA' },
  { name: 'query and fragment together', url: '/DUDE/history?tool=json&x=a%26b#frag' },
  { name: 'literal ~and~ in the query', url: '/DUDE/history?tool=json&note=x~and~y' },
  { name: 'percent-encoded characters', url: '/DUDE/history?tool=j%20son%2Fx' },
  { name: 'trailing slash', url: '/DUDE/tools/json/', expected: '/DUDE/tools/json' },
];

const currentUrl = (page: Page) => page.evaluate(() => location.pathname + location.search + location.hash);

async function normalize(page: Page, url: string): Promise<string> {
  // Compare the way the browser itself would serialize the requested URL.
  return page.evaluate((raw) => {
    const parsed = new URL(raw, location.origin);
    return parsed.pathname + parsed.search + parsed.hash;
  }, url);
}

test.describe('cold load (no service worker: public/404.html round trip)', () => {
  for (const { name, url, expected } of CASES) {
    test(name, async ({ page }) => {
      await page.goto(url);
      await expect(page.locator('app-sidebar')).toBeVisible();
      await expect.poll(() => currentUrl(page)).toBe(await normalize(page, expected ?? url));
    });
  }
});

test.describe('service-worker controlled (ngsw navigation fallback)', () => {
  for (const { name, url, expected } of CASES) {
    test(name, async ({ page }) => {
      await page.goto('/DUDE/');
      await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 35_000 });
      await page.goto(url);
      await expect(page.locator('app-sidebar')).toBeVisible();
      await expect.poll(() => currentUrl(page)).toBe(await normalize(page, expected ?? url));
    });
  }

  test('offline deep link with query and fragment still resolves from cache', async ({ page, context }) => {
    await page.goto('/DUDE/');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 35_000 });
    // One controlled online load lets ngsw's driver initialize and assign this client a version
    // (as any real second visit would) before the network goes away.
    await page.reload();
    await page.goto('/DUDE/history');
    await expect(page.locator('app-history-page')).toBeVisible();
    await context.setOffline(true);
    try {
      await page.goto('/DUDE/history?tool=json#frag');
      await expect(page.locator('app-history-page')).toBeVisible();
      await expect.poll(() => currentUrl(page)).toBe('/DUDE/history?tool=json#frag');
    } finally {
      await context.setOffline(false);
    }
  });

  test('offline, a never-visited shell page explains itself instead of a blank app', async ({ page, context }) => {
    await page.goto('/DUDE/');
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 35_000 });
    await page.reload();
    await context.setOffline(true);
    try {
      await page.goto('/DUDE/projects');
      await expect(page.locator('app-sidebar')).toBeVisible();
      await expect(page.getByRole('alert')).toContainText('Not available offline yet');
    } finally {
      await context.setOffline(false);
    }
  });
});
