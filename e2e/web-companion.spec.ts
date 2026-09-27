import { expect, test } from '@playwright/test';

// Phase 26 Items 7–9 on the production web build: the generated manifest resolves under /DUDE/
// with installable metadata, desktop-only features are badged rather than silently missing,
// "Open in Desktop DUDE" falls back to a download link when no desktop app takes the link, and
// the platform facet filters the deck.

test('the generated manifest resolves with shortcuts, file handlers, a protocol handler, and a maskable icon', async ({ page, request }) => {
  await page.goto('/DUDE/');
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifestUrl = new URL(href!, page.url()).href;
  const manifest = await (await request.get(manifestUrl)).json();

  expect(manifest.shortcuts.length).toBeGreaterThan(0);
  expect(manifest.file_handlers[0].accept['text/plain']).toContain('.json');
  expect(manifest.protocol_handlers[0].protocol).toBe('web+dude');
  const maskable = manifest.icons.find((icon: { purpose: string }) => icon.purpose === 'maskable');
  expect((await request.get(new URL(maskable.src, manifestUrl).href)).ok()).toBe(true);
  expect((await request.get(new URL(manifest.screenshots[0].src, manifestUrl).href)).ok()).toBe(true);
  expect((await request.get(new URL(manifest.shortcuts[0].url, manifestUrl).href)).status()).toBeLessThan(500);
});

test('desktop-only features are badged on the web instead of silently missing', async ({ page }) => {
  await page.goto('/DUDE/tools/regex');
  await expect(page.getByRole('heading', { name: 'Regex Tester' })).toBeVisible();
  await expect(page.locator('app-tool-shell header')).toContainText('Some features need desktop');
  const standIn = page.locator('app-desktop-only-control button');
  await expect(standIn).toBeDisabled();
  await expect(standIn).toContainText('AI Explain');
  await expect(page.locator('app-sidebar a[href="/DUDE/tools/regex"] app-desktop-feature-marker')).toContainText('desk');
});

test('Open in Desktop DUDE offers the download when no desktop app takes the link', async ({ page }) => {
  await page.goto('/DUDE/tools/json');
  await page.getByRole('button', { name: 'Share' }).click();
  await page.getByRole('menuitem', { name: 'Open in Desktop DUDE' }).click();
  await expect(page.getByText("Desktop DUDE didn't open.")).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole('link', { name: 'Get Desktop DUDE' })).toHaveAttribute('href', /github\.com\/.+\/releases/);
});

test('the platform facet filters the deck to tools that work fully in the browser', async ({ page }) => {
  await page.goto('/DUDE/');
  const deck = page.locator('app-deck');
  await deck.getByRole('radio', { name: 'Desktop-enhanced' }).click();
  await expect(deck.getByRole('link', { name: 'Regex Tester' })).toBeVisible();
  await expect(deck.getByRole('link', { name: 'Base64 Encoder / Decoder' })).toHaveCount(0);

  await deck.getByRole('radio', { name: 'Works fully in browser' }).click();
  await expect(deck.getByRole('link', { name: 'Base64 Encoder / Decoder' })).toBeVisible();
  await expect(deck.getByRole('link', { name: 'Regex Tester' })).toHaveCount(0);
});

test('a web+dude:// link from the protocol handler navigates through the strict deep-link parser', async ({ page }) => {
  await page.goto(`/DUDE/open-link?u=${encodeURIComponent('web+dude://open/tool/base64')}`);
  await expect(page.getByRole('heading', { name: 'Base64 Encoder / Decoder' })).toBeVisible();
});
