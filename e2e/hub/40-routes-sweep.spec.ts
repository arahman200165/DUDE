import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { hubUrl, pinnedTransport, signInAsOwner, trackDiagnostics } from './hub-helpers';

// Phase 31E exit gate, routes: every tool route and every workbench route is reached by a fresh hard navigation (the Hub
// must answer index.html for it), renders its page, survives a reload (direct-route recovery) and raises neither a CSP
// violation nor a console error. Runs after 10, 20 and 30 on the same Hub; the owner password is NEW_PASSWORD by then.
//
// Each route is its own test so one failure never hides the rest (this file is not serial). The tests share one signed-in page
// per worker.

const TOOLS_DIR = path.resolve(__dirname, '../../packages/tool-registry/src/tools');

interface ToolRoute {
  readonly id: string;
  readonly title: string;
  readonly route: string;
}

/** Reads every manifest (the generated registry is assembled from exactly these files). */
function toolRoutes(): ToolRoute[] {
  const routes: ToolRoute[] = [];
  for (const dir of readdirSync(TOOLS_DIR, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const text = readFileSync(path.join(TOOLS_DIR, dir.name, `${dir.name}.manifest.ts`), 'utf8');
    const id = /\bid:\s*'([^']+)'/.exec(text)?.[1];
    const title = /\btitle:\s*(?:'((?:[^'\\]|\\.)*)'|"((?:[^"\\]|\\.)*)")/.exec(text);
    const route = /\broute:\s*'([^']+)'/.exec(text)?.[1];
    if (!id || !title || !route) throw new Error(`Could not read the manifest of ${dir.name}`);
    routes.push({ id, title: (title[1] ?? title[2])!.replace(/\\(.)/g, '$1'), route });
  }
  // HUB_E2E_TOOLS=<regex on the tool id> narrows the sweep while debugging; unset it sweeps every tool.
  const only = process.env['HUB_E2E_TOOLS'] ? new RegExp(process.env['HUB_E2E_TOOLS']) : null;
  return routes.filter((r) => only === null || only.test(r.id)).sort((a, b) => a.id.localeCompare(b.id));
}

const WORKBENCH_ROUTES = ['/pipelines', '/projects', '/workspace', '/settings/sync', '/settings/endpoint', '/insights', '/history'] as const;

let page: Page;
let diagnostics: Awaited<ReturnType<typeof trackDiagnostics>>;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ baseURL: hubUrl() });
  page = await context.newPage();
  diagnostics = await trackDiagnostics(page);
  // Signed in here, not in a test: a failed test restarts the worker, which runs this hook again, and every later route
  // test must still start signed in.
  await signInAsOwner(page);
  await expect(page.locator('app-root')).toBeVisible();
});
test.afterAll(async () => {
  await page.context().close();
});

/**
 * Console errors that are not Hub-web defects. The only allow-listed noise:
 * - a missing favicon, and the browser's own "Failed to load resource ... 401/403/404" line (the Hub answers 401 to the
 *   signed-out probes of the pre-sign-in pages; the same filter the CSP sweep uses);
 * - "Blocked script execution in 'about:blank'/'about:srcdoc' because the document's frame is sandboxed": the CSS preview
 *   tools deliberately render user CSS in an iframe sandboxed without `allow-scripts`, and Chromium logs this when this
 *   suite's own diagnostics init script (`addInitScript`, injected into every frame) is refused there. It is the sandbox
 *   working, not a page script failing.
 * Nothing that mentions the CSP is ever allowed.
 */
const BENIGN = /favicon|Failed to load resource: the server responded with a status of 40[134]|Blocked script execution in 'about:(blank|srcdoc)' because the document's frame is sandboxed/;

async function expectClean(label: string): Promise<void> {
  expect(await diagnostics.cspViolations(), `${label}: CSP violations`).toEqual([]);
  expect(diagnostics.consoleErrors.filter((m) => !BENIGN.test(m)), `${label}: console errors`).toEqual([]);
}

/** The signed-in shell is up and the routed page has content (workbench pages differ in headings; the Workspace has none). */
async function expectRendered(): Promise<void> {
  await expect(page.getByTestId('sync-indicator')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('main').first()).not.toBeEmpty({ timeout: 30_000 });
}

test('the API is JSON-only and the sandbox pages carry their own CSP', async () => {
  const missing = await pinnedTransport().request({ method: 'GET', path: '/api/v1/does-not-exist' });
  expect(missing.status).toBe(404);
  expect(missing.headers['content-type']).toMatch(/^application\/json/);
  expect(typeof missing.body).toBe('object');
  expect(JSON.stringify(missing.body)).not.toMatch(/<html/i);

  const sandbox = await page.request.get('/sandbox/code.html');
  expect(sandbox.status()).toBe(200);
  expect(sandbox.headers()['content-type']).toContain('text/html');
  expect(sandbox.headers()['content-security-policy']).toContain("frame-ancestors 'self'");
});

for (const route of WORKBENCH_ROUTES) {
  test(`workbench route ${route}: hard navigation, then reload`, async () => {
    await diagnostics.clear();
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-type']).toContain('text/html');
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    await expectRendered();
    await expectClean(route);

    await diagnostics.clear();
    await page.reload();
    await expect(page).toHaveURL(new RegExp(`${route}$`));
    await expectRendered();
    await expectClean(`${route} (reload)`);
  });
}

for (const tool of toolRoutes()) {
  test(`tool ${tool.id}: hard navigation, then reload`, async () => {
    await diagnostics.clear();
    const response = await page.goto(tool.route);
    expect(response?.status()).toBe(200);
    // Desktop-only tools render their explanatory capability state under the same heading, so one assertion covers both.
    const heading = page.getByRole('heading', { level: 1 }).filter({ hasText: tool.title });
    await expect(heading.first()).toBeVisible({ timeout: 30_000 });
    await expect(page).toHaveURL(new RegExp(`${tool.route}$`));
    await expectClean(tool.route);

    await diagnostics.clear();
    await page.reload();
    await expect(heading.first()).toBeVisible({ timeout: 30_000 });
    await expectClean(`${tool.route} (reload)`);
  });
}
