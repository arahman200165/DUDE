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

test('HTML Preview CSP blocks an unallowlisted external script', async ({ page }) => {
  await page.goto('/DUDE/tools/html-preview');
  await expect(page.getByPlaceholder('Paste an HTML page here…')).toBeVisible();

  await page.evaluate(() => {
    window.addEventListener('message', (event) => {
      if (event.data?.kind === 'csp-violation') {
        (window as typeof window & { sandboxCspViolation?: string }).sandboxCspViolation = event.data.violatedDirective + '|' + event.data.blockedURI;
      }
    });
  });
  await page.getByPlaceholder('Paste an HTML page here…').fill(
    '<script>window.addEventListener("securitypolicyviolation", event => parent.postMessage({kind:"csp-violation", violatedDirective:event.violatedDirective, blockedURI:event.blockedURI}, "*"))</script>' +
    '<script src="https://example.invalid/unallowlisted.js"></script>',
  );

  // The real preview document reports the browser's CSP event across its
  // opaque-origin boundary. Assert both the directive and blocked URL.
  await expect.poll(() => page.evaluate(() =>
    (window as typeof window & { sandboxCspViolation?: string }).sandboxCspViolation ?? '',
  )).toBe('script-src-elem|https://example.invalid/unallowlisted.js');
});

test('destroying and recreating the Python sandbox recovers a suspended run', async ({ page }) => {
  test.setTimeout(90_000);
  // The E2E static server does not add the CORS header required by the opaque-origin iframe's module load.
  await page.route('**/assets/vendor/pyodide/**', async (route) => {
    const response = await route.fetch();
    await route.fulfill({ response, headers: { ...response.headers(), 'access-control-allow-origin': '*' } });
  });
  await page.goto('/DUDE/tools/python-playground');
  await expect(page.getByRole('heading', { name: 'Python Playground' })).toBeVisible();
  const frame = page.locator('app-python-sandbox-host iframe');
  const originalFrame = await frame.elementHandle();
  expect(originalFrame).not.toBeNull();

  await page.getByPlaceholder('Type Python here…').fill('import asyncio\nawait asyncio.sleep(3600)');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stop' })).toBeEnabled({ timeout: 60_000 });
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.getByText('Stopped. The Python runtime will reload on the next run.')).toBeVisible();

  // A cancellable run suspended in Python must discard its old iframe and let
  // the host run code in a freshly initialized Pyodide realm.
  await expect.poll(() => originalFrame!.evaluate((element) => element.isConnected)).toBe(false);
  await page.getByPlaceholder('Type Python here…').fill('print("recovered")');
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('recovered', { exact: true })).toBeVisible({ timeout: 60_000 });
});
