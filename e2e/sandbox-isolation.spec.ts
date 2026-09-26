import { expect, test } from '@playwright/test';

// Regression suite for the Phase 6 code-sandbox's two isolation guarantees (DUDE_PRD.md §21
// Phase 23 Item 9) -- both are documented in src/app/shared/code-sandbox/AGENTS.md as caught
// only by live browser testing, never unit tests, so this drives the real built app in a real
// browser rather than asserting on generated HTML strings the way the existing unit specs do.

test('the sandbox iframe is opaque-origin -- the host page cannot reach into its document', async ({ page }) => {
  await page.goto('/DUDE/tools/js-playground');
  await expect(page.getByRole('heading', { name: 'JavaScript Playground' })).toBeVisible();

  const access = await page.evaluate(() => {
    const frame = document.querySelector('iframe');
    if (!frame) return 'no-iframe';
    try {
      // sandbox="allow-scripts" with no "allow-same-origin" gives the iframe an opaque origin --
      // same-origin policy should block the embedder from reaching in, exactly as it would
      // block the iframe from reaching out. If someone ever adds "allow-same-origin" back,
      // this line stops throwing and the test catches it.
      void frame.contentDocument!.body;
      return 'accessible';
    } catch {
      return 'blocked';
    }
  });

  expect(access).toBe('blocked');
});

test('Worker.terminate() actually stops a hung script within the execution budget', async ({ page }) => {
  await page.goto('/DUDE/tools/js-playground');
  await expect(page.getByRole('heading', { name: 'JavaScript Playground' })).toBeVisible();

  await page.getByPlaceholder('Type JavaScript here…').fill('while (true) {}');
  await page.getByRole('button', { name: 'Run', exact: true }).click();

  // Default timeout is 3s (js-playground.ts's DEFAULT_TIMEOUT_MS) -- if Worker.terminate()
  // stopped guaranteeing a hard, non-cooperative stop, this would hang well past that budget
  // instead of reporting termination.
  await expect(page.getByText(/Terminated: exceeded the 3s execution limit\./)).toBeVisible({ timeout: 6000 });

  // The page itself must still be responsive -- a real hang would leave the tab unresponsive
  // to further input, not just show a stale message.
  await page.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(page.getByPlaceholder('Type JavaScript here…')).toHaveValue('');
});
