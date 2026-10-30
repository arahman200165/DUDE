import { mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import { PASSWORD, hubClient, openHubBrowser, signInAsOwner, spawnExtraHub, type ExtraHub } from './hub-helpers';

// Phase 31J exit gate (PD-115): two browsers, both signed in as the owner (each its own browser row), co-edit the scratchpad, a user
// script and a Markdown Hub room on one Hub; the room is kept on the Hub after the disclosure; an older version of the kept document is
// restored and both browsers show it; Settings > Devices shows both browsers online; and the bell receives a backup-failed notification
// from a failing scheduled backup without a reload, and dismisses it.
//
// It runs on its own Hub (the compiled TEST bundle, a fresh data directory) so the short timings below never touch the shared Hub of
// specs 10-50. TEST-ONLY knobs (PD-068, ignored by the release bundle): the scheduled-backup check runs every second, and history
// snapshots are taken 1 s after the last edit with no minimum spacing. The scheduled backup fails for real: its schedule is written to
// the Hub's config while it runs (the scheduler re-reads it on every check) together with one folder destination, but no master key was ever saved (that
// is what `backup destination add` does), so the run fails with `master-key-missing` and the audited failure reaches the bell through the notification
// producers. (Since Milestone 847 a schedule with no destination is a silent no-op, and the unattended key is the v2 master key.)
test.describe.configure({ mode: 'serial' });

const KNOBS = { DUDE_HUB_TEST_BACKUP_CHECK_MS: '1000', DUDE_HUB_TEST_COLLAB_SNAPSHOT_IDLE_MS: '1000', DUDE_HUB_TEST_COLLAB_SNAPSHOT_MIN_INTERVAL_MS: '0' };
const LIVE = { timeout: 20_000 };

let root = '';
let hub: ExtraHub;
let browser: Browser;
let a: Page;
let b: Page;
let keptDocKey = '';

/** A fetch from inside the page: same origin, the page's own owner cookie (Node-side requests would not trust this Hub's CA). */
async function api<T>(p: Page, url: string): Promise<T> {
  return p.evaluate(async (target) => {
    const res = await fetch(target, { credentials: 'same-origin', headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`${target}: ${res.status}`);
    return res.json();
  }, url) as Promise<T>;
}

/** The CodeMirror content of the editor labelled `label` (the editor chunk loads lazily; the textarea fallback is not used here). */
const editor = (p: Page, label: string): Locator => p.locator(`.cm-content[aria-label="${label}"]`);

/**
 * The document text of an editor: its lines without the remote-cursor carets and name labels `y-codemirror.next` draws inside them
 * (and the word joiners around those widgets), so it reads what the document holds.
 */
const editorText = (p: Page, label: string): Promise<string> =>
  editor(p, label).evaluate((element) => {
    const copy = element.cloneNode(true) as HTMLElement;
    for (const widget of copy.querySelectorAll('.cm-ySelectionCaret, .cm-ySelectionInfo, .cm-widgetBuffer')) widget.remove();
    return [...copy.querySelectorAll('.cm-line')].map((line) => line.textContent ?? '').join('\n').replaceAll('⁠', '');
  });

/** Waits until the editor's document text contains (or, with `not`, no longer contains) `text`. */
async function expectEditor(p: Page, label: string, text: string, options: { not?: boolean } = {}): Promise<void> {
  const poll = expect.poll(() => editorText(p, label), { message: `${label} ${options.not ? 'without' : 'with'} "${text}"`, ...LIVE });
  await (options.not ? poll.not.toContain(text) : poll.toContain(text));
}

/** Puts the caret at the end of the editor and types `text`. */
async function typeAtEnd(p: Page, label: string, text: string): Promise<void> {
  const content = editor(p, label);
  await expect(content).toBeVisible(LIVE);
  await content.click();
  await p.keyboard.press('Control+End');
  await p.keyboard.type(text);
}

const markNoReload = (p: Page): Promise<unknown> => p.evaluate(() => ((window as unknown as { __noReload: boolean }).__noReload = true));
const stillNoReload = (p: Page): Promise<unknown> => p.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload);

test.beforeAll(async () => {
  root = mkdtempSync(path.join(tmpdir(), 'dude-hub-e2e-collab-'));
});

test.afterAll(async () => {
  await browser?.close().catch(() => undefined);
  await hub?.stop().catch(() => undefined);
  try {
    if (root !== '') rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // A leftover temp directory is harmless.
  }
});

test('setup: a fresh Hub, two signed-in browsers, web access for the scratchpad, scripts and Markdown documents', async () => {
  test.setTimeout(180_000);
  const dataDir = path.join(root, 'hub');
  hub = await spawnExtraHub(dataDir, KNOBS);
  const setupToken = readFileSync(path.join(dataDir, 'config', 'setup-token'), 'utf8').trim();
  await hubClient(hub.target).bootstrap({ setupToken, ownerDisplayName: 'Collab Owner', environmentName: 'Collab Environment', password: PASSWORD });

  const opened = await openHubBrowser(hub.target);
  browser = opened.browser;
  a = opened.page;
  // A second cookie jar, so a second installation and browser row. Its user agent names it differently ("Edge"), so each browser can
  // tell the other's presence apart from its own.
  const contextB = await browser.newContext({ baseURL: hub.target.url, userAgent: `${await a.evaluate(() => navigator.userAgent)} Edg/140.0.0.0` });
  b = await contextB.newPage();

  await signInAsOwner(a, PASSWORD);
  await a.goto('/settings/sync');
  await expect(a.getByTestId('phase-copy')).toContainText('Live', LIVE);
  for (const id of ['scratchpad', 'pipelines', 'collab-documents']) {
    const toggle = a.getByTestId(`toggle-${id}`);
    await expect(toggle).toBeEnabled(LIVE);
    if (await toggle.isChecked()) continue;
    const reloaded = a.waitForEvent('load');
    await toggle.check();
    await reloaded;
    await expect(a.getByTestId('phase-copy')).toContainText('Live', LIVE);
    await expect(a.getByTestId(`toggle-${id}`)).toBeChecked();
  }

  await signInAsOwner(b, PASSWORD);
  await expect(b.locator('app-root')).toBeVisible();
});

test('a. scratchpad: both browsers co-edit a note body live and see each other in that note', async () => {
  // Opening the drawer writes the scratchpad record (its `drawerExpanded` field). B opens its drawer only once A's write is on the Hub
  // and B has loaded it: two first writes of the same record at the same moment are the ordinary record conflict, not this test's subject.
  const openDrawer = async (p: Page): Promise<void> => {
    await p.goto('/workspace');
    const toggle = p.locator('app-scratchpad-drawer button').first();
    await expect(toggle).toContainText('Scratchpad');
    if ((await toggle.innerText()).includes('▸')) await toggle.click();
    await expect(p.locator('[data-scratchpad-live]')).toContainText('Live', LIVE);
  };
  await openDrawer(a);
  await expect
    .poll(async () => (await api<{ records: { entityType: string }[] }>(a, '/api/v1/web/snapshot')).records.some((r) => r.entityType === 'scratchpad'), LIVE)
    .toBe(true);
  await openDrawer(b);
  for (const p of [a, b]) await expect(p.locator('[data-scratchpad-live]')).toContainText('2 participants', LIVE);

  await a.getByRole('button', { name: '+ New note' }).click();
  await typeAtEnd(a, 'Note body', 'Hello from A.');
  await expect(b.locator('app-scratchpad-drawer')).toContainText('Hello from A.', LIVE);

  await b.locator('app-scratchpad-drawer').getByRole('button', { name: 'Edit', exact: true }).click();
  await expectEditor(b, 'Note body', 'Hello from A.');
  await typeAtEnd(b, 'Note body', ' And from B.');
  await expectEditor(a, 'Note body', 'Hello from A. And from B.');
  await expectEditor(b, 'Note body', 'Hello from A. And from B.');

  // Presence: each browser sees the other's cursor in this note's body, under the other browser row's name.
  await expect(a.locator('[data-scratchpad-presence]')).toContainText(/Edge on .* in the note/, LIVE);
  await expect(b.locator('[data-scratchpad-presence]')).toContainText(/Chrome on .* in the note/, LIVE);
});

test('b. user script: saved in A, opened in B, and the body is co-edited live', async () => {
  await a.goto('/pipelines/scripts/new');
  const name = a.getByPlaceholder('Script name');
  await name.fill('Collab script');
  await name.press('Tab');
  await typeAtEnd(a, 'Script body', 'return input.value;');
  await a.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(a).toHaveURL(/\/pipelines\/scripts\/(?!new$)[^/]+$/, LIVE);
  const url = new URL(a.url()).pathname;
  await expect(a.locator('[data-script-live]')).toContainText('Live', LIVE);

  // The saved script reaches B through sync; a direct load picks it up once it is there.
  await expect(async () => {
    await b.goto(url);
    await expect(b.getByPlaceholder('Script name')).toHaveValue('Collab script', { timeout: 5_000 });
  }).toPass({ timeout: 30_000 });
  for (const p of [a, b]) await expect(p.locator('[data-script-live]')).toContainText('2 participants', LIVE);
  await expectEditor(b, 'Script body', 'return input.value;');

  await typeAtEnd(a, 'Script body', ' // A was here');
  await expectEditor(b, 'Script body', 'return input.value; // A was here');
  await typeAtEnd(b, 'Script body', ' and B');
  await expectEditor(a, 'Script body', 'return input.value; // A was here and B');
});

test('c. Markdown Hub room: started in A, joined from B, co-edited, then kept on the Hub after the disclosure', async () => {
  for (const p of [a, b]) {
    await p.goto('/tools/markdown-workspace');
    await p.locator('[data-hub-room-toggle]').click();
    await expect(p.locator('[data-hub-room-panel]')).toBeVisible();
  }
  const source = editor(a, 'Markdown source');
  await expect(source).toBeVisible(LIVE);
  await source.click();
  await a.keyboard.press('Control+A');
  await a.keyboard.type('# Collab room');
  await a.locator('[data-hub-room-name]').fill('E2E room');
  await a.locator('[data-hub-room-start]').click();
  await expect(a.locator('[data-hub-room-status]')).toContainText('E2E room', LIVE);

  // B finds the room in the list and joins it.
  await expect(async () => {
    await b.locator('[data-hub-room-panel]').getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(b.locator('[data-hub-room]').filter({ hasText: 'E2E room' })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await b.locator('[data-hub-room]').filter({ hasText: 'E2E room' }).getByRole('button', { name: 'Join' }).click();
  for (const p of [a, b]) await expect(p.locator('[data-hub-room-status]')).toContainText('2 participants', LIVE);
  await expectEditor(b, 'Markdown source', '# Collab room');

  await typeAtEnd(a, 'Markdown source', ' from A');
  await expectEditor(b, 'Markdown source', '# Collab room from A');
  await typeAtEnd(b, 'Markdown source', ' and B');
  await expectEditor(a, 'Markdown source', '# Collab room from A and B');

  // Keep on Hub: the disclosure names the destination and the retention before anything is stored.
  await a.locator('[data-hub-keep]').click();
  const disclosure = a.locator('[data-hub-keep-disclosure]');
  await expect(disclosure).toContainText('Where it is stored: your Hub.');
  await expect(disclosure).toContainText('Retention: kept until you delete it.');
  await disclosure.locator('[data-hub-keep-title]').fill('E2E kept doc');
  await disclosure.locator('[data-hub-keep-confirm]').click();
  await expect(a.locator('[data-hub-room-status]')).toContainText('Kept document', LIVE);
  await expect(a.locator('[data-hub-document]').filter({ hasText: 'E2E kept doc' })).toBeVisible(LIVE);

  const docs = await api<{ documents: { id: string; title: string }[] }>(a, '/api/v1/collab/documents');
  const kept = docs.documents.find((d) => d.title === 'E2E kept doc');
  expect(kept).toBeDefined();
  keptDocKey = `markdown-doc:${kept!.id}`;

  // B leaves the room and opens the kept document from the list.
  await b.locator('[data-hub-leave]').click();
  await expect(async () => {
    await b.locator('[data-hub-room-panel]').getByRole('button', { name: 'Refresh', exact: true }).click();
    await expect(b.locator('[data-hub-document]').filter({ hasText: 'E2E kept doc' })).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
  await b.locator('[data-hub-document]').filter({ hasText: 'E2E kept doc' }).locator('[data-hub-document-open]').click();
  await expect(b.locator('[data-hub-room-status]')).toContainText('Kept document', LIVE);
  for (const p of [a, b]) await expect(p.locator('[data-hub-room-status]')).toContainText('2 participants', LIVE);
  await expectEditor(b, 'Markdown source', '# Collab room from A and B');
});

test('e. history: an older version of the kept document is restored and both browsers show it', async () => {
  interface Summary { id: string; takenAt: string }
  const newestPayload = async (): Promise<string> => {
    const { snapshots } = await api<{ snapshots: Summary[] }>(a, `/api/v1/collab/history?doc=${encodeURIComponent(keptDocKey)}`);
    if (snapshots.length === 0) return '';
    const newest = [...snapshots].sort((x, y) => y.takenAt.localeCompare(x.takenAt))[0]!;
    return JSON.stringify((await api<{ payload: unknown }>(a, `/api/v1/collab/history/${encodeURIComponent(newest.id)}`)).payload);
  };

  await typeAtEnd(a, 'Markdown source', ' ALPHA');
  await expect.poll(newestPayload, { timeout: 20_000 }).toContain('ALPHA');
  await typeAtEnd(a, 'Markdown source', ' BETA');
  await expect.poll(newestPayload, { timeout: 20_000 }).toContain('BETA');
  for (const p of [a, b]) await expectEditor(p, 'Markdown source', 'ALPHA BETA');

  await a.locator('[data-hub-history]').click();
  const dialog = a.locator('[data-collab-history]');
  await expect(dialog).toBeVisible();
  const items = dialog.locator('[data-collab-history-item]');
  await expect(items.nth(1)).toBeVisible(LIVE);
  // Pick the version that has ALPHA but not yet BETA.
  let picked = false;
  for (let i = 0; i < (await items.count()) && !picked; i += 1) {
    await items.nth(i).click();
    // The selection renders with the loading state, so the preview read below is this version's and never the previous one's.
    await expect(items.nth(i)).toHaveAttribute('aria-pressed', 'true');
    const preview = dialog.locator('[data-collab-history-text]');
    await expect(preview).toBeVisible(LIVE);
    const text = await preview.innerText();
    picked = text.includes('ALPHA') && !text.includes('BETA');
  }
  expect(picked, 'a saved version with ALPHA and without BETA').toBe(true);
  await dialog.locator('[data-collab-history-restore]').click();
  await dialog.locator('[data-collab-history-restore-confirm]').click();
  await expect(dialog).toHaveCount(0, LIVE);
  await expect(a.locator('[data-hub-history-status]')).toContainText('Restored an earlier version');

  // The restore is a forward edit through the live document: both open editors show it.
  for (const p of [a, b]) {
    await expectEditor(p, 'Markdown source', 'BETA', { not: true });
    await expectEditor(p, 'Markdown source', '# Collab room from A and B ALPHA');
  }
});

test('d. presence: Settings > Devices shows both browsers online', async () => {
  await a.goto('/settings/devices');
  const row = (name: RegExp): Locator => a.locator('tr').filter({ has: a.getByTestId('device-name').filter({ hasText: name }) });
  await expect(row(/Chrome on/)).toContainText('Online', LIVE);
  await expect(row(/Edge on/)).toContainText('Online', LIVE);
});

test('f. the bell receives a backup-failed notification without a reload, and dismiss removes it', async () => {
  // A on Settings > Devices, B still on the kept document: both shells show the bell.
  for (const p of [a, b]) {
    await expect(p.getByTestId('notifications-bell')).toBeVisible();
    await markNoReload(p);
  }

  // Configure a schedule while the Hub runs (atomically): the next check (within a second) runs it, and it fails without a master key.
  const configFile = path.join(hub.target.dataDir, 'config', 'hub.json');
  const config = JSON.parse(readFileSync(configFile, 'utf8')) as Record<string, unknown>;
  config['backup'] = {
    schedule: { intervalHours: 1 },
    destinations: [{ id: 'e2e-destination', kind: 'local-folder', label: 'Collab spec destination', folder: path.join(root, 'scheduled-backups') }],
  };
  writeFileSync(`${configFile}.tmp`, `${JSON.stringify(config, null, 2)}\n`);
  renameSync(`${configFile}.tmp`, configFile);

  for (const p of [a, b]) await expect(p.getByTestId('notifications-badge')).toBeVisible(LIVE);
  for (const p of [b, a]) {
    await p.getByTestId('notifications-bell').click();
    const item = p.getByTestId('notification-item').filter({ hasText: 'A backup failed' });
    await expect(item).toHaveCount(1, LIVE);
    await expect(item).toContainText('master-key-missing');
    expect(await stillNoReload(p)).toBe(true);
  }

  const item = a.getByTestId('notification-item').filter({ hasText: 'A backup failed' });
  await item.getByTestId('notification-dismiss').click();
  await expect(item).toHaveCount(0, LIVE);
  await expect
    .poll(async () => (await api<{ notifications: { title: string }[] }>(a, '/api/v1/notifications')).notifications.some((n) => n.title === 'A backup failed'), LIVE)
    .toBe(false);
  expect(await stillNoReload(a)).toBe(true);
});
