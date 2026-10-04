import { expect, test, type Page } from '@playwright/test';
import {
  NEW_PASSWORD, SimulatedDevice, favoritePayload, hubClient, hubUrl, pairSimulatedDevice, signInAsOwner, submitWithRetry, trackDiagnostics, upsertOp,
} from './hub-helpers';

// Phase 31E exit gate, shared state: an authenticated Hub web page reads and writes the environment's shared records
// through the owner-session web routes, stays in step with a desktop (simulated here by an enrolled device that talks
// to the Hub's device sync routes), refuses writes while the Hub is unreachable, survives session expiry without
// wiping local data, and wipes the origin at sign-out.
//
// Runs after 10-hub-flow.spec.ts and 20-csp-sweep.spec.ts on the same Hub; the owner password is NEW_PASSWORD by then.
test.describe.configure({ mode: 'serial' });

let page: Page;
let diagnostics: Awaited<ReturnType<typeof trackDiagnostics>>;
let device: SimulatedDevice;
/** While true, the Hub's `changes-available` nudges are dropped on the way to the page (see the conflict test). */
let holdNudges = false;

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ baseURL: hubUrl() });
  page = await context.newPage();
  diagnostics = await trackDiagnostics(page);
  // Relay the realtime socket untouched, except that the conflict test can hold back the nudges. Without a nudge the
  // page never pulls, so the device's concurrent edit is genuinely unseen when the browser writes (a true conflict).
  await page.routeWebSocket(/\/api\/v1\/realtime/, (ws) => {
    const server = ws.connectToServer();
    ws.onMessage((message) => server.send(message));
    server.onMessage((message) => {
      if (holdNudges && typeof message === 'string' && message.includes('changes-available')) return;
      ws.send(message);
    });
  });
});
test.afterAll(async () => {
  await page.context().close();
});

const indicator = (): ReturnType<Page['getByTestId']> => page.getByTestId('sync-indicator');
const sidebarFavorite = (title: string): ReturnType<Page['locator']> => page.locator('nav button').filter({ hasText: '★' }).filter({ hasText: title });
const JSON_TITLE = 'JSON Formatter';
const UUID_TITLE = 'UUID Generator';
const BASE64_TITLE = 'Base64 Encoder / Decoder';

/**
 * Asserts a record's origin is a browser row of the device registry. Every sign-out wipes the installation id, so earlier
 * specs left several browser rows behind (one per installation, by design); the origin is checked by kind, not by name.
 */
async function expectBrowserOrigin(deviceId: string | null): Promise<void> {
  expect(deviceId).not.toBeNull();
  const bearer = await device.ownerBearer(NEW_PASSWORD);
  const row = (await hubClient().listDevices(bearer)).find((d) => d.deviceId === deviceId);
  expect(row?.kind).toBe('browser');
  expect(row?.displayName).toMatch(/^Browser/);
}

test('sign in as the owner and pair a simulated desktop', async () => {
  await signInAsOwner(page);
  await expect(page.locator('app-root')).toBeVisible();
  device = await pairSimulatedDevice(page, 'Simulated Desktop');
  expect(await device.token()).toMatch(/^ddt_/);
});

test('a. the browser attaches: Devices lists a Browser row and Settings > Sync is Live with the web-access toggles', async () => {
  await page.goto('/settings/devices');
  await expect(page.getByTestId('device-name').filter({ hasText: /^Browser/ }).first()).toBeVisible();
  await expect(page.getByTestId('device-row-' + device.deviceId)).toBeVisible();
  await expect(page.getByTestId('device-name').filter({ hasText: 'Simulated Desktop' })).toBeVisible();

  // The device table lists what each device has reported; a desktop reports after every pull.
  await device.reportState(0);
  await page.goto('/settings/sync');
  await expect(page.getByTestId('hub-web-sync')).toBeVisible();
  await expect(page.getByTestId('phase-copy')).toContainText('Live');
  await expect(indicator()).toHaveAttribute('data-state', 'synced');
  for (const id of ['settings', 'favorites', 'pipelines', 'projects']) await expect(page.getByTestId(`toggle-${id}`)).toBeChecked();
  // The per-device table lists the desktop and this browser.
  await expect(page.getByTestId('device-row').filter({ hasText: '(this browser)' })).toHaveAttribute('data-kind', 'browser');
  await expect(page.getByTestId('device-row').filter({ hasText: 'Simulated Desktop' })).toHaveAttribute('data-kind', 'desktop');
});

test('b. browser to device: a favorite pinned in the UI reaches a device with the browser as origin', async () => {
  await page.goto('/tools/base64');
  await page.getByTitle('Pin to Favorites').click();
  await expect(page.getByTitle('Unpin from Favorites')).toHaveAttribute('aria-pressed', 'true');

  await expect.poll(async () => (await device.latest('favorite', 'tool:base64'))?.deleted, { timeout: 15_000 }).toBe(false);
  const record = await device.latest('favorite', 'tool:base64');
  expect(record?.payload).toMatchObject({ kind: 'tool', targetId: 'base64' });
  await expectBrowserOrigin(record?.updatedByDeviceId ?? null);
});

test('c. device to browser, live: a favorite the device pushes appears without a reload', async () => {
  await page.goto('/tools/base64');
  await expect(indicator()).toHaveAttribute('data-state', 'synced');
  // The navigation is a full page load; mark this document so a reload would be caught.
  await page.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
  await expect(sidebarFavorite(JSON_TITLE)).toHaveCount(0);

  const [result] = await device.push([upsertOp('favorite', 'tool:json', favoritePayload('json', 1), null)]);
  expect(result?.status).toBe('applied');

  await expect(sidebarFavorite(JSON_TITLE)).toBeVisible({ timeout: 10_000 });
  expect(await page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
});

test('d. a setting round trip: the theme set here reaches the device and the one the device sets applies live', async () => {
  await page.goto('/settings/appearance');
  await page.getByRole('group', { name: 'Theme', exact: true }).getByRole('button', { name: 'Light', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');

  await expect
    .poll(async () => ((await device.latest('setting', 'settings:appearance'))?.payload as { value?: { mode?: string } } | null)?.value?.mode, { timeout: 15_000 })
    .toBe('light');
  const record = (await device.latest('setting', 'settings:appearance'))!;
  expect(record.payload).toMatchObject({ namespace: 'settings', key: 'appearance' });
  await expectBrowserOrigin(record.updatedByDeviceId);

  const payload = record.payload as { namespace: string; key: string; value: Record<string, unknown> };
  const [result] = await device.push([upsertOp('setting', 'settings:appearance', { ...payload, value: { ...payload.value, mode: 'dark' } }, record.revision)]);
  expect(result?.status).toBe('applied');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark', { timeout: 10_000 });
});

// A true overlapping edit cannot be made with two live peers because the page would pull the device's edit the moment it
// lands. So the page's realtime nudges are held back (`holdNudges`), the device edits the record on the revision the
// page last saw, and the page then edits the same field: the Hub answers with a conflict and the page's three-way merge
// has no clean answer.
test('e. merge3 conflict: the dialog offers Keep Hub, Keep mine and Keep both, and Keep mine reaches the device', async () => {
  await page.goto('/pipelines/new');
  const name = page.getByLabel('Pipeline name');
  await name.fill('E2E Alpha');
  await name.press('Tab');
  await expect(page).toHaveURL(/\/pipelines\/[^/]+$/);
  const id = decodeURIComponent(page.url().split('/').pop()!);
  await expect.poll(async () => (await device.latest('pipeline', id))?.deleted, { timeout: 15_000 }).toBe(false);
  const first = (await device.latest('pipeline', id))!;
  expect((first.payload as { name: string }).name).toBe('E2E Alpha');

  holdNudges = true;
  try {
    const [applied] = await device.push([
      upsertOp('pipeline', id, { ...(first.payload as object), name: 'Device Name', description: 'edited on the device' }, first.revision),
    ]);
    expect(applied?.status).toBe('applied');

    await name.fill('Browser Name');
    await name.press('Tab');
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toBeVisible({ timeout: 10_000 });
    await expect(dialog.getByRole('heading', { name: 'This item changed on the Hub' })).toBeVisible();
    await expect(dialog.getByTestId('conflict-fields')).toContainText('name');
    await expect(dialog.getByTestId('keep-hub')).toBeVisible();
    await expect(dialog.getByTestId('keep-mine')).toBeVisible();
    await expect(dialog.getByTestId('keep-both')).toBeVisible();

    await dialog.getByTestId('keep-mine').click();
    await expect(dialog).toHaveCount(0);
    await expect.poll(async () => ((await device.latest('pipeline', id))?.payload as { name?: string } | null)?.name, { timeout: 15_000 }).toBe('Browser Name');
  } finally {
    holdNudges = false;
  }
});

test('f. web access: turning Favorites off reloads the page and hides Hub favorites; turning it on brings them back', async () => {
  await page.goto('/settings/sync');
  await expect(page.getByTestId('toggle-favorites')).toBeChecked();
  await expect(sidebarFavorite(JSON_TITLE)).toBeVisible();

  const reloaded = page.waitForEvent('load');
  await page.getByTestId('toggle-favorites').uncheck();
  await reloaded;
  await expect(page.getByTestId('toggle-favorites')).not.toBeChecked();
  // The Hub's favorites are no longer shown here (the page kept them off its shared state).
  await expect(page.getByTestId('hub-web-sync')).toBeVisible();
  await expect(sidebarFavorite(JSON_TITLE)).toHaveCount(0);

  const [result] = await device.push([upsertOp('favorite', 'tool:uuid', favoritePayload('uuid', 2), null)]);
  expect(result?.status).toBe('applied');
  // The nudge arrives (the socket stays up) but is filtered; give it a moment, then check nothing leaked in.
  await page.waitForTimeout(3_000);
  await expect(sidebarFavorite(UUID_TITLE)).toHaveCount(0);
  await expect(sidebarFavorite(JSON_TITLE)).toHaveCount(0);

  const back = page.waitForEvent('load');
  await page.getByTestId('toggle-favorites').check();
  await back;
  await expect(page.getByTestId('toggle-favorites')).toBeChecked();
  await expect(sidebarFavorite(JSON_TITLE)).toBeVisible({ timeout: 10_000 });
  await expect(sidebarFavorite(UUID_TITLE)).toBeVisible();
});

test('g. Hub unreachable: the indicator says so, a favorite write is refused, a loaded tool works, and it recovers', async () => {
  await page.goto('/tools/base64');
  await expect(indicator()).toHaveAttribute('data-state', 'synced');
  await expect(page.getByTitle('Unpin from Favorites')).toHaveAttribute('aria-pressed', 'true');

  await page.context().setOffline(true);
  try {
    await page.getByTitle('Unpin from Favorites').click();
    await expect(page.getByTestId('hub-toast').filter({ hasText: 'Hub unreachable — change not saved' })).toBeVisible({ timeout: 15_000 });
    await expect(indicator()).toHaveAttribute('data-state', 'offline', { timeout: 15_000 });
    // The refused change is rolled back: the tool is still pinned.
    await expect(page.getByTitle('Unpin from Favorites')).toHaveAttribute('aria-pressed', 'true');

    // A browser-safe tool that is already loaded keeps working.
    await page.getByPlaceholder('Type or paste text here…').fill('Hello');
    await expect(page.locator('textarea[readonly]')).toHaveValue('SGVsbG8=');
  } finally {
    await page.context().setOffline(false);
  }
  await expect(indicator()).toHaveAttribute('data-state', 'synced', { timeout: 60_000 });
});

test('h. session expiry: the page locks to sign-in without wiping local data, and signing in again restores it', async () => {
  await page.goto('/tools/base64');
  await expect(indicator()).toHaveAttribute('data-state', 'synced');
  await page.evaluate(() => localStorage.setItem('e2e-local-only', 'kept'));

  const bearer = await device.ownerBearer(NEW_PASSWORD);
  const client = hubClient();
  const cookies = (await client.listSessions(bearer)).filter((s) => s.kind === 'cookie');
  expect(cookies.length).toBeGreaterThan(0);
  for (const session of cookies) await client.revokeSession(bearer, session.sessionId);

  await expect(page).toHaveURL(/\/hub\/sign-in/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Sign in to this Hub' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('e2e-local-only'))).toBe('kept');

  await submitWithRetry(page, /\/hub\/sign-in/, NEW_PASSWORD);
  await expect(page).not.toHaveURL(/\/hub\/sign-in/);
  await expect(page.locator('app-root')).toBeVisible();
  await page.goto('/settings/sync');
  await expect(page.getByTestId('phase-copy')).toContainText('Live');
  // Signing in again did not wipe either (only sign-out does).
  expect(await page.evaluate(() => localStorage.getItem('e2e-local-only'))).toBe('kept');
});

test('i. sign-out wipes the origin (storage and IndexedDB) but keeps the service worker caches', async () => {
  await page.goto('/settings/devices');
  await expect(page.getByTestId('owner-signed-in')).toBeVisible();
  await page.evaluate(async () => {
    localStorage.setItem('e2e-sentinel', '1');
    sessionStorage.setItem('e2e-sentinel', '1');
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('e2e-sentinel-db', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('s');
      request.onsuccess = () => {
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  });
  expect(await page.evaluate(async () => (await indexedDB.databases()).map((d) => d.name))).toContain('e2e-sentinel-db');

  // The service worker registers once the app is stable and fills its caches with the public app shell.
  await expect.poll(() => page.evaluate(async () => (await navigator.serviceWorker.getRegistration()) !== undefined), { timeout: 30_000 }).toBe(true);
  await expect.poll(() => page.evaluate(async () => (await caches.keys()).some((k) => k.startsWith('ngsw:'))), { timeout: 30_000 }).toBe(true);

  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/\/hub\/sign-in/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Sign in to this Hub' })).toBeVisible({ timeout: 15_000 });

  const after = await page.evaluate(async () => ({
    local: Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])),
    session: Object.keys(sessionStorage),
    databases: (await indexedDB.databases()).map((d) => d.name),
    caches: await caches.keys(),
  }));
  // The sign-in page that just booted writes its own defaults (the appearance mirror); nothing else may survive: no
  // installation id, no sentinel, and the appearance is what a never-visited browser holds, not the signed-in session's.
  const fresh = await page.context().browser()!.newContext({ baseURL: hubUrl() });
  const freshPage = await fresh.newPage();
  await freshPage.goto('/hub/sign-in');
  await expect(freshPage.getByRole('heading', { name: 'Sign in to this Hub' })).toBeVisible();
  const defaults = await freshPage.evaluate(() => Object.fromEntries(Object.keys(localStorage).map((k) => [k, localStorage.getItem(k)])));
  await fresh.close();
  expect(after.local, 'localStorage holds only what a fresh browser holds (installation id and sentinel wiped)').toEqual(defaults);
  // The boot authority gate (Phase 31G) records the Hub it just saw (`__device__:hubAuthority`, local-only, no secret) on every
  // boot, including the sign-in page this sign-out lands on, so that key is rewritten by design; the installation id is not.
  expect(Object.keys(after.local).filter((k) => /__device__(?!:hubAuthority$)|e2e-/.test(k))).toEqual([]);
  expect(after.session).toEqual([]);
  expect(after.databases).not.toContain('e2e-sentinel-db');
  expect(after.caches.some((k) => k.startsWith('ngsw:'))).toBe(true);
});
