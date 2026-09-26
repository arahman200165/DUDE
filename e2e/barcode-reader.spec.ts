import { resolve } from 'node:path';
import { expect, test } from '@playwright/test';

const fixturePath = resolve(process.cwd(), 'e2e/fixtures/barcode-reader-known-content.png');
const expectedContent = 'DUDE barcode reader fixture v1: https://example.test/scan?id=42';

test('barcode reader decodes an independently generated QR image in the browser', async ({ page }) => {
  await page.goto('/DUDE/tools/barcode-reader');
  await expect(page.getByRole('heading', { name: 'Barcode Reader' })).toBeVisible();

  await page.locator('app-file-drop input[type="file"]').setInputFiles(fixturePath);

  await expect(page.getByText('Decoded content')).toBeVisible();
  await expect(page.locator('app-barcode-reader').getByText(expectedContent, { exact: true })).toBeVisible();
});
