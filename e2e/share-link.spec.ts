import { expect, test } from '@playwright/test';

// Shareable Tool Routes (DUDE_PRD.md §21 Phase 26 Item 12) end to end. The sender embeds its input
// via the explicit "Copy link with input" action. A cold recipient (no service worker, so the
// GitHub Pages 404.html round trip) lands on the tool with the input prefilled, sees the notice,
// and the payload is gone from the address bar.

test('a link with input survives the 404 deep-link round trip and prefills the recipient', async ({ browser }) => {
  const sender = await browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await sender.newPage();
  await page.goto('/DUDE/tools/json');
  const input = page.locator('app-tool-shell textarea').first();
  await input.fill('{"shared":true,"n":42}');

  await page.getByRole('button', { name: 'Share' }).click();
  await expect(page.getByRole('menu')).toContainText('Anyone with the link can read it');
  await page.getByRole('menuitem', { name: 'Copy link with input' }).click();
  await expect(page.getByRole('menu')).toContainText('Link with input copied.');
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/DUDE\/tools\/json#in=v1\.[A-Za-z0-9_-]+$/);

  await page.getByRole('menuitem', { name: 'Copy link', exact: true }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\/DUDE\/tools\/json$/);
  await sender.close();

  const recipient = await browser.newContext();
  const received = await recipient.newPage();
  await received.goto(link);
  await expect(received.getByRole('heading', { name: 'JSON Formatter' })).toBeVisible();
  await expect(received.locator('app-tool-shell textarea').first()).toHaveValue('{"shared":true,"n":42}');
  await expect(received.getByRole('status').filter({ hasText: 'Input loaded from a shared link' })).toBeVisible();
  await expect.poll(() => received.evaluate(() => location.hash)).toBe('');
  await recipient.close();
});

test('an ordinary #fragment on a tool route is left alone', async ({ page }) => {
  await page.goto('/DUDE/tools/json#section-2');
  await expect(page.getByRole('heading', { name: 'JSON Formatter' })).toBeVisible();
  expect(await page.evaluate(() => location.hash)).toBe('#section-2');
  await expect(page.getByText('Input loaded from a shared link')).toHaveCount(0);
});
