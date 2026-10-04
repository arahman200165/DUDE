import { expect, test, type Page } from '@playwright/test';
import { NEW_PASSWORD, PASSWORD, SimulatedDevice, hubClient, hubUrl, pinnedTransport, readSetupToken, submitWithRetry, trackDiagnostics } from './hub-helpers';

// One Hub, one browser context, strictly serial: each step builds on the Hub state left by the previous one.
test.describe.configure({ mode: 'serial' });




let page: Page;
let diagnostics: Awaited<ReturnType<typeof trackDiagnostics>>;
let setupCodes: string[] = [];
let currentCodes: string[] = [];
let device: SimulatedDevice;
let deviceId = '';

test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ baseURL: hubUrl() });
  page = await context.newPage();
  diagnostics = await trackDiagnostics(page);
});
test.afterAll(async () => {
  await page.context().close();
});

async function readCodes(p: Page): Promise<string[]> {
  await expect(p.getByTestId('recovery-code')).toHaveCount(10);
  const codes = await p.getByTestId('recovery-code').allInnerTexts();
  expect(codes).toHaveLength(10);
  return codes.map((c) => c.trim());
}

/**
 * Submits the current form and, when the Hub's credential-endpoint rate bucket answers 'Too many attempts' (the specs
 * issue a burst of sign-ins), waits out the page's own retry countdown and submits again.
 */
/** Hub web sign-out wipes the origin and hard-navigates to the sign-in page (PD-053); wait for it to land. */
async function signOut(p: Page): Promise<void> {
  await p.getByRole('button', { name: 'Sign out' }).click();
  await p.waitForURL(/\/hub\/sign-in/, { timeout: 15_000 });
  await expect(p.getByRole('heading', { name: 'Sign in to this Hub' })).toBeVisible({ timeout: 15_000 });
}

test.describe('a. unbootstrapped Hub', () => {
  test('redirects / to the setup page and keeps the API JSON-only', async () => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/hub\/setup$/);
    await expect(page.getByRole('heading', { name: 'Set up this Hub' })).toBeVisible();
    expect(await diagnostics.cspViolations()).toEqual([]);

    const hello = await pinnedTransport().request({ method: 'GET', path: '/api/v1/hello' });
    expect(hello.status).toBe(200);
    expect(hello.headers['content-type']).toMatch(/^application\/json/);
    expect(hello.body).toMatchObject({ service: expect.any(String), bootstrapped: false });

    const missing = await pinnedTransport().request({ method: 'GET', path: '/api/v1/does-not-exist' });
    expect(missing.status).toBe(404);
    expect(missing.headers['content-type']).toMatch(/^application\/json/);
    expect(typeof missing.body).toBe('object');
  });

  test('serves index.html for a deep link, and the app then redirects to setup', async () => {
    const response = await page.goto('/settings/environment');
    expect(response?.status()).toBe(200);
    expect(response?.headers()['content-type']).toContain('text/html');
    await expect(page).toHaveURL(/\/hub\/setup$/);
  });
});

test.describe('b. setup', () => {
  test('consumes the fragment token and shows the recovery codes once', async () => {
    const token = readSetupToken();
    // A hash-only change inside the already-loaded SPA would not reload it, so start from a blank document.
    await page.goto('about:blank');
    await page.goto(`/hub/setup#token=${token}`);
    await expect(page.getByRole('heading', { name: 'Set up this Hub' })).toBeVisible();
    await expect.poll(() => page.url()).not.toContain(token);
    expect(page.url()).not.toContain('#');
    await expect(page.getByLabel('Setup token')).toHaveValue(token);

    await page.getByLabel('Environment name').fill('E2E Environment');
    await page.getByLabel('Owner display name').fill('E2E Owner');
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByLabel('Confirm password').fill(PASSWORD);
    await page.getByTestId('submit').click();

    setupCodes = await readCodes(page);
    const proceed = page.getByTestId('codes-continue');
    await expect(proceed).toBeDisabled();
    await page.getByTestId('saved-checkbox').check();
    await expect(proceed).toBeEnabled();
    await proceed.click();

    await expect(page).toHaveURL(/\/settings\/devices\?hint=pair-desktop$/);
    await expect(page.getByTestId('owner-signed-in')).toBeVisible();
    expect(await (await page.request.get('/api/v1/hello')).json()).toMatchObject({ bootstrapped: true });
  });
});

test.describe('c. devices', () => {
  test('pairs a simulated device, renames it and revokes it with the two-step flow', async () => {
    await page.getByRole('button', { name: 'Pair a device' }).click();
    const pairingString = (await page.getByTestId('pairing-string').innerText()).trim();
    expect(pairingString).toMatch(/^dude-pair:v1:localhost:\d+:[0-9A-Z]{8}:[A-Za-z0-9_-]{43}$/);
    await expect(page.getByTestId('pairing-qr').locator('img, canvas, svg').first()).toBeVisible();

    device = new SimulatedDevice();
    deviceId = device.deviceId;
    await device.enroll(pairingString, 'Simulated Laptop');
    expect(await device.token()).toMatch(/^ddt_/);

    await page.reload();
    const row = page.getByTestId(`device-row-${deviceId}`);
    await expect(row).toBeVisible();
    await expect(row.getByTestId('device-name')).toHaveText('Simulated Laptop');

    await row.getByRole('button', { name: 'Rename Simulated Laptop' }).click();
    await page.getByLabel('New name for Simulated Laptop').fill('Renamed Laptop');
    await page.getByRole('button', { name: 'Save name' }).click();
    await expect(row.getByTestId('device-name')).toHaveText('Renamed Laptop');

    // Step one only previews: nothing is revoked until the confirm button is pressed.
    await row.getByRole('button', { name: 'Revoke Renamed Laptop…' }).click();
    await expect(page.getByTestId('revoke-confirm')).toBeVisible();
    await expect(row.getByText('Revoked', { exact: true })).toHaveCount(0);
    await page.getByRole('button', { name: 'Confirm revoke Renamed Laptop' }).click();
    await expect(row.getByText('Revoked', { exact: true })).toBeVisible();
    await expect(device.token()).rejects.toThrow();
  });
});

test.describe('d. security', () => {
  test('lists sessions and audit events after a deep-link reload and regenerates recovery codes', async () => {
    await page.goto('/settings/security');
    await expect(page.getByTestId('session-row')).toHaveCount(1);
    await expect(page.getByTestId('current-tag')).toBeVisible();
    for (const label of ['Hub set up', 'Owner signed in', 'Device enrolled', 'Device revoked']) {
      await expect(page.getByTestId('audit-row').filter({ hasText: label }).first()).toBeVisible();
    }

    await page.getByTestId('codes-generate').click();
    await expect(page.getByTestId('codes-confirm')).toBeVisible();
    await page.getByTestId('codes-apply').click();
    currentCodes = await readCodes(page);
    expect(currentCodes.filter((c) => setupCodes.includes(c))).toEqual([]);
    await page.getByTestId('saved-checkbox').check();
    await page.getByTestId('codes-continue').click();
    await expect(page.getByTestId('recovery-code')).toHaveCount(0);
    await expect(page.getByTestId('remaining-codes')).toContainText('10 of 10');
  });
});

test.describe('e. sign-out, sign-in and recovery', () => {
  test('signs out, rejects a wrong password, signs in and recovers with a recovery code', async () => {
    // The steps so far spent most of the credential-endpoint burst (10 requests, then 20 per minute); let it refill.
    await page.waitForTimeout(10_000);
    await page.goto('/settings/devices');
    await signOut(page);
    await expect(page.getByRole('heading', { name: 'Sign in to this Hub' })).toBeVisible();

    await page.getByLabel('Password').fill('definitely not the password');
    await page.getByTestId('submit').click();
    await expect(page.getByTestId('error')).toContainText('not correct');
    // Reload so the stale error text cannot be mistaken for the next attempt's outcome.
    await page.goto('/hub/sign-in');
    await page.getByLabel('Password').fill(PASSWORD);
    await submitWithRetry(page, /\/hub\/sign-in/, PASSWORD);
    await page.goto('/settings/devices');
    await expect(page.getByTestId('owner-signed-in')).toBeVisible();

    await signOut(page);
    await page.goto('/hub/recover');
    // The regenerated codes replaced the ones shown at setup, which no longer work.
    await page.getByLabel('Recovery code').fill(setupCodes[0]!);
    await page.getByLabel('New password').fill(NEW_PASSWORD);
    await page.getByTestId('submit').click();
    await expect(page.getByTestId('error')).toContainText('not valid');

    await page.goto('/hub/recover');
    await page.getByLabel('Recovery code').fill(currentCodes[0]!);
    await page.getByLabel('New password').fill(NEW_PASSWORD);
    await submitWithRetry(page, /\/hub\/recover/);

    // The recovered session is signed in; the new password then works for a fresh sign-in.
    await page.goto('/settings/devices');
    await expect(page.getByTestId('owner-signed-in')).toBeVisible();
    await signOut(page);
    await page.getByLabel('Password').fill(NEW_PASSWORD);
    await submitWithRetry(page, /\/hub\/sign-in/, NEW_PASSWORD);
    expect(await hubClient().hello()).toMatchObject({ bootstrapped: true });
  });
});
