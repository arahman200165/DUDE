import { expect, test } from '@playwright/test';

test('network tools stay discoverable on web and hand off to desktop without running checks', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (/api\.ipify\.org|dns-query|whois|rdap/.test(request.url())) requests.push(request.url());
  });
  await page.goto('/DUDE/tools/ping');
  await expect(page.getByRole('heading', { name: 'Ping' })).toBeVisible();
  await expect(page.getByText('Live network checks require the Windows desktop app.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Run check' })).toHaveCount(0);
  await page.goto('/DUDE/');
  await page.locator('app-deck').getByPlaceholder(/Search tools/).fill('DNS Propagation');
  await expect(page.locator('app-deck').getByRole('link', { name: 'DNS Propagation' })).toBeVisible();
  await page.keyboard.press('Control+k');
  const palette = page.locator('app-command-palette');
  await palette.getByPlaceholder(/Search tools/).fill('Port Scanner');
  await expect(palette.getByRole('button', { name: 'Port Scanner' })).toBeVisible();
  expect(requests).toEqual([]);
});
