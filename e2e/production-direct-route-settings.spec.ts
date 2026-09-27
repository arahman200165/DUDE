import { expect, test } from '@playwright/test';

test('a fresh /settings URL redirects to General and lists every section', async ({ page }) => {
  await page.goto('/DUDE/settings');

  await expect(page).toHaveURL(/\/DUDE\/settings\/general$/);
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(page.getByLabel('Reopen my tabs on restart')).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Settings sections' });
  for (const title of ['General', 'AI / LLM Provider', 'Hotkeys', 'Window & Updates', 'Files', 'Data & Privacy']) {
    await expect(nav.getByRole('link', { name: new RegExp(`^${title.replace(/[/&]/g, '\\$&')}`) })).toBeVisible();
  }
});

test('a fresh desktop-only section URL on web shows the desktop explainer', async ({ page }) => {
  await page.goto('/DUDE/settings/ai');

  await expect(page).toHaveURL(/\/DUDE\/settings\/ai$/);
  await expect(page.getByText('Available in the DUDE desktop app.')).toBeVisible();
});

test('the sidebar footer Settings link opens Settings, and Settings is no longer a tool', async ({ page }) => {
  await page.goto('/DUDE/');
  await page.getByRole('link', { name: 'Settings', exact: true }).click();
  await expect(page).toHaveURL(/\/DUDE\/settings\/general$/);
  await expect(page.locator('a[href="/DUDE/tools/settings"]')).toHaveCount(0);
});
