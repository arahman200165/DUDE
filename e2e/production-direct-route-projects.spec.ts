import { expect, test } from '@playwright/test';

test('a fresh Projects URL loads the gallery and can save the current layout', async ({ page }) => {
  await page.goto('/DUDE/projects');

  await expect(page).toHaveURL(/\/DUDE\/projects$/);
  await expect(page.getByRole('heading', { name: 'Projects' })).toBeVisible();
  await page.getByPlaceholder(/Save current workspace as/).fill('My Project');
  await page.getByRole('button', { name: 'New project' }).click();
  await expect(page.getByText('My Project')).toBeVisible();
});

