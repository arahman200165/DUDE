import { expect, test } from '@playwright/test';
import { enrollThroughUi, firstSyncThroughUi, launchDesktop, newPairingString, removeProfile, type Desktop } from './sync-helpers';

/**
 * Two real desktops, one Hub, real UI. Enrollment and the first-sync wizard run through Settings; the specs then
 * prove live apply (favorites, appearance), a concurrent conflict resolved in the inbox, and the shell indicator.
 */
test.describe.configure({ mode: 'serial' });

let a: Desktop;
let b: Desktop;

const indicator = (d: Desktop) => d.page.getByTestId('sync-indicator');
const sidebarFavorites = (d: Desktop) => d.page.locator('app-sidebar button:has(span:text-is("★"))');

test.beforeAll(async () => {
  test.setTimeout(420_000);
  a = await launchDesktop('a');
  b = await launchDesktop('b');
  await enrollThroughUi(a, await newPairingString());
  await enrollThroughUi(b, await newPairingString());
  await firstSyncThroughUi(a);
  await firstSyncThroughUi(b);
});

test.afterAll(async () => {
  for (const d of [a, b]) {
    if (!d) continue;
    await d.close();
    removeProfile(d);
  }
});

test('both desktops are enrolled and show the shell sync indicator as synced', async () => {
  for (const d of [a, b]) {
    await expect(indicator(d)).toBeVisible();
    await expect(indicator(d)).toHaveAttribute('data-state', /^(synced|syncing)$/);
    await expect(indicator(d)).toHaveAttribute('data-state', 'synced', { timeout: 60_000 });
    await expect(indicator(d)).toContainText('Synced');
  }
});

test('a favorite set on A appears in B\'s sidebar without a restart or reload', async () => {
  await b.goto('/');
  await expect(sidebarFavorites(b)).toHaveCount(0);

  await a.goto('/tools');
  await a.page.getByRole('button', { name: /^Favorite / }).first().click();
  await expect(a.page.getByRole('button', { name: /^Unfavorite / }).first()).toBeVisible();

  // B is not navigated or reloaded: the Agent pulls, the bridge pushes, the renderer applies in place.
  await expect(sidebarFavorites(b)).toHaveCount(1, { timeout: 60_000 });
  await expect(indicator(a)).toHaveAttribute('data-state', 'synced', { timeout: 60_000 });
});

test('a theme change on A updates B\'s <html data-theme> live', async () => {
  const html = b.page.locator('html');
  const before = await html.getAttribute('data-theme');
  const next = before === 'light' ? 'Dark' : 'Light';

  await a.goto('/settings/appearance');
  await a.page.getByTestId('row-theme').getByRole('button', { name: next, exact: true }).click();
  await expect(a.page.locator('html')).toHaveAttribute('data-theme', next.toLowerCase());

  await expect(html).toHaveAttribute('data-theme', next.toLowerCase(), { timeout: 60_000 });

  // Put it back so later specs run in the default theme.
  await a.page.getByTestId('row-theme').getByRole('button', { name: before === 'light' ? 'Light' : 'Dark', exact: true }).click();
  await expect(html).toHaveAttribute('data-theme', before ?? 'dark', { timeout: 60_000 });
});

test('a concurrent pipeline edit conflicts, shows in the indicator and resolves with Keep mine', async () => {
  // A creates a pipeline through the builder; it syncs to B.
  await a.goto('/pipelines/new');
  const nameA = a.page.getByLabel('Pipeline name');
  await nameA.fill('Shared pipeline');
  await nameA.press('Enter');
  await expect(a.page).toHaveURL(/\/pipelines\/[0-9a-f-]+$/);
  const pipelineUrl = a.page.url();
  const route = new URL(pipelineUrl).pathname;
  await expect(indicator(a)).toHaveAttribute('data-state', 'synced', { timeout: 60_000 });

  await b.goto('/pipelines');
  await expect(b.page.getByText('Shared pipeline', { exact: true })).toBeVisible({ timeout: 60_000 });

  // Pause B, then both rename the same field.
  await b.goto('/settings/sync');
  await b.page.getByTestId('pause').click();
  await expect(indicator(b)).toHaveAttribute('data-state', 'paused');

  await b.goto(route);
  const nameB = b.page.getByLabel('Pipeline name');
  await nameB.fill('Name from B');
  await nameB.press('Enter');
  await expect(nameB).toHaveValue('Name from B');

  await a.goto(route);
  const nameA2 = a.page.getByLabel('Pipeline name');
  await nameA2.fill('Name from A');
  await nameA2.press('Enter');
  await expect(indicator(a)).toHaveAttribute('data-state', 'synced', { timeout: 60_000 });

  // The paused indicator is visible, with B's edit waiting in its outbox.
  await b.goto('/settings/sync');
  await expect(b.page.getByTestId('pending-count')).not.toHaveText('0');

  // Resume B: its push is stale, so the Agent files a conflict.
  await b.page.getByTestId('pause').click();
  await expect(indicator(b)).toHaveAttribute('data-state', 'conflicts', { timeout: 60_000 });
  await expect(indicator(b)).toContainText('1 conflict');

  // Resolve through the inbox: see the diff, Keep mine.
  await indicator(b).click();
  await expect(b.page).toHaveURL(/\/settings\/sync$/);
  await b.page.locator('[data-testid^="conflict-"]:not([data-testid="conflict-detail"]):not([data-testid="conflict-error"])').first().click();
  const detail = b.page.getByTestId('conflict-detail');
  await expect(detail).toBeVisible();
  await expect(detail).toContainText('Name from B');
  await expect(detail).toContainText('Name from A');
  await detail.getByTestId('keep-mine').click();
  await expect(b.page.getByTestId('no-conflicts')).toBeVisible({ timeout: 30_000 });

  // Both converge on B's name.
  await expect(indicator(b)).toHaveAttribute('data-state', 'synced', { timeout: 60_000 });
  await a.goto('/pipelines');
  await expect(a.page.getByText('Name from B', { exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(a.page.getByText('Name from A', { exact: true })).toHaveCount(0);
  await b.goto('/pipelines');
  await expect(b.page.getByText('Name from B', { exact: true })).toBeVisible();
});

test('the shell indicator reports paused, conflicts and synced states', async () => {
  // The conflict and paused states were asserted in the previous spec; this one pins the paused label and the
  // return to synced on the other side of a pause/resume with no edits.
  await b.goto('/settings/sync');
  await b.page.getByTestId('pause').click();
  await expect(indicator(b)).toHaveAttribute('data-state', 'paused');
  await expect(indicator(b)).toContainText('Paused');
  await b.page.getByTestId('pause').click();
  await expect(indicator(b)).toHaveAttribute('data-state', 'synced', { timeout: 60_000 });
  await expect(indicator(b)).toContainText('Synced');
});
