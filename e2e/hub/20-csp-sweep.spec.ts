import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { NEW_PASSWORD, hubUrl, trackDiagnostics } from './hub-helpers';

// Runs after 10-hub-flow.spec.ts (same Hub, already bootstrapped; the owner password is NEW_PASSWORD by then).
// Every page below must load and run its engine under the Hub's CSP with zero `securitypolicyviolation` events and
// no console errors that mention the CSP.
test.describe.configure({ mode: 'serial' });

let page: Page;
let diagnostics: Awaited<ReturnType<typeof trackDiagnostics>>;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ baseURL: hubUrl() });
  page = await context.newPage();
  diagnostics = await trackDiagnostics(page);
});
test.afterAll(async () => {
  await page.context().close();
});

async function expectClean(label: string): Promise<void> {
  expect(await diagnostics.cspViolations(), `${label}: CSP violations`).toEqual([]);
  expect(diagnostics.consoleErrors.filter((m) => !/favicon|Failed to load resource: the server responded with a status of 40[134]/.test(m)), `${label}: console errors`).toEqual([]);
}

// 1x1 transparent PNG.
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

test('sign in as the owner', async () => {
  await page.goto('/hub/sign-in');
  await page.getByLabel('Password').fill(NEW_PASSWORD);
  await expect(page.getByTestId('submit')).toBeEnabled({ timeout: 30_000 });
  await page.getByTestId('submit').click();
  await expect(page).not.toHaveURL(/\/hub\/sign-in/);
});

test('Hub pages: sign-in, security settings and home', async () => {
  await diagnostics.clear();
  await page.goto('/settings/security');
  await expect(page.getByTestId('audit-row').first()).toBeVisible();
  await expectClean('/settings/security');
  await page.goto('/');
  await expect(page.locator('app-root')).toBeVisible();
  await expectClean('/');
});

// Phase 31E (PD-055): the sandbox tools load static `/sandbox/*.html` loader pages by `src`; the Hub serves each with
// its own CSP (frame-ancestors 'self'), so their inline bootstraps run without loosening the app CSP. These tests
// were expected failures in 31C (srcdoc frames inherited the app CSP).

test('Python (Pyodide in a sandboxed iframe)', async () => {
  await diagnostics.clear();
  await page.goto('/tools/python-playground');
  await page.getByPlaceholder('Type Python here…').fill('print(6 * 7)');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('42', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expectClean('python-playground');
});

test('JavaScript Playground (sandboxed iframe + Worker)', async () => {
  await diagnostics.clear();
  await page.goto('/tools/js-playground');
  await page.getByPlaceholder('Type JavaScript here…').fill('console.log(6 * 7)');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('42', { exact: true })).toBeVisible({ timeout: 10_000 });
  await expectClean('js-playground');
});

test('HTML Preview (sandboxed iframe running the previewed page)', async () => {
  await diagnostics.clear();
  await page.goto('/tools/html-preview');
  await page.getByPlaceholder('Paste an HTML page here…').fill('<p id="x">before</p><script>document.getElementById("x").textContent="ran"</script>');
  await expect(page.frameLocator('iframe').getByText('ran')).toBeVisible({ timeout: 10_000 });
  await expectClean('html-preview');
});

test('SQLite (sql.js wasm)', async () => {
  await diagnostics.clear();
  const dir = mkdtempSync(path.join(tmpdir(), 'dude-hub-e2e-sqlite-'));
  const file = path.join(dir, 'sample.db');
  const db = new DatabaseSync(file);
  db.exec('CREATE TABLE widgets (id INTEGER PRIMARY KEY, name TEXT); INSERT INTO widgets (name) VALUES (\'sprocket\');');
  db.close();
  try {
    await page.goto('/tools/sqlite-viewer');
    await page.locator('input[type=file]').first().setInputFiles(file);
    await expect(page.getByText('widgets').first()).toBeVisible({ timeout: 30_000 });
    await expectClean('sqlite-viewer');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Web Worker (CSV Cleaner above the worker threshold)', async () => {
  await diagnostics.clear();
  await page.goto('/tools/csv-cleaner');
  const rows = Array.from({ length: 3500 }, (_, i) => `row${i} , value${i}`).join('\n');
  await page.getByPlaceholder('Paste messy CSV here…').fill(`name,value\n${rows}`);
  await expect(page.getByRole('button', { name: 'Copy' })).toBeVisible({ timeout: 30_000 });
  await expectClean('csv-cleaner (worker)');
});

test('WebAssembly (xmllint via XML XSD Validator)', async () => {
  await diagnostics.clear();
  await page.goto('/tools/xml-xsd-validator');
  await page.getByPlaceholder('Paste the XML document to validate here…').fill('<a>1</a>');
  await page.getByPlaceholder('Paste the XSD schema here…').fill(
    '<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"><xs:element name="a" type="xs:integer"/></xs:schema>',
  );
  await page.getByRole('button', { name: 'Validate' }).click();
  await expect(page.getByText(/Valid — the document conforms/)).toBeVisible({ timeout: 60_000 });
  await expectClean('xml-xsd-validator');
});

test('Blob object URLs (Image Compressor)', async () => {
  await diagnostics.clear();
  await page.goto('/tools/image-compressor');
  await page.locator('input[type=file]').first().setInputFiles({ name: 'dot.png', mimeType: 'image/png', buffer: PNG_1X1 });
  await page.getByRole('button', { name: 'Compress', exact: true }).click();
  await expect(page.getByAltText('Compressed preview')).toBeVisible({ timeout: 30_000 });
  expect(await page.getByAltText('Compressed preview').getAttribute('src')).toMatch(/^blob:/);
  // Download re-reads the object URL with fetch(), which connect-src has to allow.
  const download = page.waitForEvent('download', { timeout: 10_000 });
  await page.getByRole('button', { name: 'Download' }).click();
  await download.catch(() => undefined);
  await expectClean('image-compressor (download)');
  expect((await download).suggestedFilename()).toBe('dot-compressed.webp');
  await expectClean('image-compressor');
});

test('Canvas charts (Insights)', async () => {
  await diagnostics.clear();
  await page.goto('/insights');
  await expect(page.getByRole('heading', { name: /Insights/ }).first()).toBeVisible();
  // Charts only mount when there is usage data; the visits above recorded some.
  await page.waitForTimeout(1500);
  expect(await page.locator('canvas').count()).toBeGreaterThan(0);
  await expectClean('insights');
});
