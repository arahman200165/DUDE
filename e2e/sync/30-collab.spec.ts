import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test, type Browser, type Locator, type Page } from '@playwright/test';
import type { DeviceStoreBoot } from '@dude/contracts';
import { openHubBrowser, signInAsOwner, spawnExtraHub, type ExtraHub } from '../hub/hub-helpers';
import {
  OWNER_PASSWORD, bootstrapOwner, bridgeCall, bridgeResult, enrollThroughUi, firstSyncThroughUi, hubStatus, launchDesktop, newPairingString, removeProfile,
  startLinkRelay, syncStatus, viaLinkRelay, waitUntilSynced, type Desktop, type LinkRelay,
} from './sync-helpers';

/**
 * Phase 31J exit gate (PD-115), desktop half: a real Electron desktop collaborates through its resident Agent's relay (PD-106) with a
 * Hub web browser on one Hub, then edits offline and is merged on reconnect (PD-102) with no conflict-inbox entry and no duplication.
 *
 * The Hub is the compiled TEST bundle serving the Hub web build (`dist/hub-test`, `dist/hub-web/browser`), on its own data directory.
 *
 * The offline sequence: the desktop reaches the Hub only through a {@link LinkRelay} (a TCP relay on `[::1]` at the Hub's port; the
 * pairing string is pointed at it), while the browser talks to the Hub directly (Chromium maps `localhost` to `127.0.0.1`, so it never
 * touches the relay). Cutting the relay therefore takes down ONLY the desktop's link, with the Hub and the browser still live, which
 * makes the concurrent edit controllable: the browser edits the start of the body while the desktop, past its 10 s grace, edits the end
 * in local mode and saves it to the outbox. Restoring the relay drains the outbox; the Hub flushes the live document (with the
 * browser's edit) and three-way merges the desktop's older-revision write into it.
 */
test.describe.configure({ mode: 'serial' });

const LIVE = { timeout: 30_000 };
const BODY = 'Script body';

let root = '';
let hub: ExtraHub;
let relay: LinkRelay;
let browser: Browser;
let web: Page;
let desk: Desktop;
let scriptId = '';

/** The CodeMirror content of the editor labelled `label`. */
const editor = (p: Page, label: string): Locator => p.locator(`.cm-content[aria-label="${label}"]`);

/** The editor's document text, without the remote carets and name labels `y-codemirror.next` draws inside its lines. */
const editorText = (p: Page, label: string): Promise<string> =>
  editor(p, label).evaluate((element) => {
    const copy = element.cloneNode(true) as HTMLElement;
    for (const widget of copy.querySelectorAll('.cm-ySelectionCaret, .cm-ySelectionInfo, .cm-widgetBuffer')) widget.remove();
    return [...copy.querySelectorAll('.cm-line')].map((line) => line.textContent ?? '').join('\n').replaceAll('⁠', '');
  });

async function expectEditor(p: Page, text: string, options: { exact?: boolean } = {}): Promise<void> {
  const poll = expect.poll(() => editorText(p, BODY), { message: `${BODY} ${options.exact ? 'equal to' : 'with'} "${text}"`, ...LIVE });
  await (options.exact ? poll.toBe(text) : poll.toContain(text));
}

/** Puts the caret at the start or end of the body and types `text`. */
async function typeAt(p: Page, where: 'start' | 'end', text: string): Promise<void> {
  const content = editor(p, BODY);
  await expect(content).toBeVisible(LIVE);
  await content.click();
  await p.keyboard.press(where === 'start' ? 'Control+Home' : 'Control+End');
  await p.keyboard.type(text);
}

/** A same-origin fetch with the browser's owner cookie (Node-side requests would not trust this Hub's CA). */
async function api<T>(p: Page, url: string): Promise<T> {
  return p.evaluate(async (target) => {
    const res = await fetch(target, { credentials: 'same-origin', headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`${target}: ${res.status}`);
    return res.json();
  }, url) as Promise<T>;
}

/** The script body the Hub holds (newest record, through the browser's web snapshot). */
async function hubBody(): Promise<string | null> {
  const { records } = await api<{ records: { entityType: string; entityId: string; payload: { body?: string } | null }[] }>(web, '/api/v1/web/snapshot?limit=1000');
  return records.find((r) => r.entityType === 'user-script' && r.entityId === scriptId)?.payload?.body ?? null;
}

/** The script body in the desktop's Device State Store. */
async function deskBody(): Promise<string | null> {
  const boot = await bridgeCall<DeviceStoreBoot>(desk, 'store.hydrate');
  const record = boot.records.find((r) => r.entityType === 'user-script' && r.entityId === scriptId);
  return (record?.payload as { body?: string } | undefined)?.body ?? null;
}

const occurrences = (text: string, part: string): number => text.split(part).length - 1;

test.beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'dude-sync-e2e-collab-'));
});

test.afterAll(async () => {
  await browser?.close().catch(() => undefined);
  if (desk !== undefined) {
    await desk.close();
    removeProfile(desk);
  }
  await relay?.down().catch(() => undefined);
  await hub?.stop().catch(() => undefined);
  try {
    if (root !== '') rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  } catch {
    // A leftover temp directory is harmless.
  }
});

test('setup: one Hub with its web, a browser with web access to scripts, and a desktop enrolled through its own link', async () => {
  test.setTimeout(360_000);
  hub = await spawnExtraHub(path.join(root, 'hub'));
  await bootstrapOwner(hub.target);
  relay = await startLinkRelay(hub.target.port);

  // The browser resolves `localhost` to IPv4 only, so it reaches the Hub directly and never through the desktop's relay.
  const opened = await openHubBrowser(hub.target, { args: ['--host-resolver-rules=MAP localhost 127.0.0.1'] });
  browser = opened.browser;
  web = opened.page;
  await signInAsOwner(web, OWNER_PASSWORD);
  await web.goto('/settings/sync');
  await expect(web.getByTestId('phase-copy')).toContainText('Live', LIVE);
  const toggle = web.getByTestId('toggle-pipelines');
  await expect(toggle).toBeEnabled(LIVE);
  if (!(await toggle.isChecked())) {
    const reloaded = web.waitForEvent('load');
    await toggle.check();
    await reloaded;
    await expect(web.getByTestId('phase-copy')).toContainText('Live', LIVE);
    await expect(web.getByTestId('toggle-pipelines')).toBeChecked();
  }
  expect(relay.connections(), 'the browser must not reach the Hub through the desktop relay').toBe(0);

  desk = await launchDesktop('collab');
  await enrollThroughUi(desk, viaLinkRelay(await newPairingString(hub.target)));
  await firstSyncThroughUi(desk);
  expect((await hubStatus(desk)).connection).toBe('online');
  expect(relay.connections(), 'the desktop reaches the Hub through its relay').toBeGreaterThan(0);
});

test('a. live: a script saved on the desktop is co-edited with the browser through the Agent relay', async () => {
  test.setTimeout(240_000);
  await desk.goto('/pipelines/scripts/new');
  const name = desk.page.getByPlaceholder('Script name');
  await name.fill('Desktop collab script');
  await name.press('Tab');
  await typeAt(desk.page, 'end', 'return input.value;');
  await desk.page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(desk.page).toHaveURL(/\/pipelines\/scripts\/(?!new(?:[?#]|$))[^/?#]+/, LIVE);
  scriptId = /\/pipelines\/scripts\/([^/?#]+)/.exec(desk.page.url())![1]!;
  // The editor asks for the live document before the save has left the outbox (the Hub answers not-found) and asks again once it has.
  await expect(desk.page.locator('[data-script-live]')).toContainText('Live', LIVE);

  // The saved script reaches the Hub through the desktop's outbox; a direct load in the browser picks it up once it is there.
  await expect(async () => {
    await web.goto(`/pipelines/scripts/${scriptId}`);
    await expect(web.getByPlaceholder('Script name')).toHaveValue('Desktop collab script', { timeout: 5_000 });
  }).toPass({ timeout: 60_000 });
  // Presence: the desktop sees the browser in the document, and the browser sees the desktop.
  for (const p of [desk.page, web]) await expect(p.locator('[data-script-live]')).toContainText('2 participants', LIVE);
  await expectEditor(web, 'return input.value;');

  await typeAt(desk.page, 'end', ' // desk');
  await expectEditor(web, 'return input.value; // desk', { exact: true });
  await typeAt(web, 'end', ' web');
  await expectEditor(desk.page, 'return input.value; // desk web', { exact: true });
  await expect(desk.page.locator('[data-script-live]')).toContainText(/^\s*Live ·/, LIVE);
});

test('b. offline: the desktop keeps editing past the grace, saves locally, and the edits merge on reconnect exactly once, with no conflict', async () => {
  test.setTimeout(360_000);
  const expected = '/* hub */ return input.value; // desk web +grace +local';

  // Only the desktop's link goes down; the Hub and the browser stay live.
  await relay.down();
  await expect(desk.page.locator('[data-script-live]')).toContainText('Live, reconnecting', LIVE);
  // Within the 10 s grace the live document is still editable on the desktop.
  await typeAt(desk.page, 'end', ' +grace');
  await expectEditor(desk.page, 'return input.value; // desk web +grace', { exact: true });

  // Meanwhile the browser, still live on the Hub, edits a different part of the body.
  await typeAt(web, 'start', '/* hub */ ');
  await expectEditor(web, '/* hub */ return input.value; // desk web', { exact: true });

  // Past the grace the desktop falls back to local mode, carrying the grace edit, and Save goes to the outbox.
  await expect(desk.page.locator('[data-script-note]')).toContainText('Not connected to your Hub', LIVE);
  await expect(desk.page.locator('[data-script-live]')).toHaveCount(0);
  await expectEditor(desk.page, 'return input.value; // desk web +grace', { exact: true });
  await typeAt(desk.page, 'end', ' +local');
  await expectEditor(desk.page, 'return input.value; // desk web +grace +local', { exact: true });
  await desk.page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect.poll(async () => (await syncStatus(desk)).pending, { message: 'the local save is queued in the outbox', ...LIVE }).toBeGreaterThan(0);
  expect(await deskBody()).toBe('return input.value; // desk web +grace +local');
  // The browser's edit is untouched by the desktop's local work while the link is down.
  await expectEditor(web, '/* hub */ return input.value; // desk web', { exact: true });

  // The link comes back: the outbox drains and the Hub merges the older-revision write into the live document.
  await relay.up();
  await expect
    .poll(async () => {
      const connection = (await hubStatus(desk)).connection;
      if (connection !== 'online') await bridgeResult(desk, 'sync.syncNow').catch(() => undefined);
      return connection;
    }, { message: 'the desktop never came back online', timeout: 120_000, intervals: [2_000] })
    .toBe('online');
  await waitUntilSynced(desk, 120_000);

  // Converged everywhere, both edits exactly once: the Hub record, the desktop's store, the browser's and the desktop's editors.
  await expect.poll(hubBody, { message: 'the Hub record', ...LIVE, timeout: 60_000 }).toBe(expected);
  await expect.poll(deskBody, { message: 'the desktop record', ...LIVE, timeout: 60_000 }).toBe(expected);
  await expectEditor(web, expected, { exact: true });
  await expectEditor(desk.page, expected, { exact: true });
  for (const part of ['/* hub */', 'return input.value;', '// desk web', '+grace', '+local']) expect(occurrences(expected, part)).toBe(1);

  // The desktop is back in live mode on a fresh document, with the browser in it again.
  await expect(desk.page.locator('[data-script-note]')).toHaveCount(0, LIVE);
  await expect(desk.page.locator('[data-script-live]')).toContainText(/^\s*Live ·/, LIVE);
  for (const p of [desk.page, web]) await expect(p.locator('[data-script-live]')).toContainText('2 participants', LIVE);
  await typeAt(desk.page, 'end', ' ok');
  await expectEditor(web, `${expected} ok`, { exact: true });

  // No conflict-inbox entry: the Agent holds none, and Settings > Sync shows the empty inbox.
  expect((await syncStatus(desk)).conflicts).toBe(0);
  await desk.goto('/settings/sync');
  await expect(desk.page.getByTestId('no-conflicts')).toBeVisible(LIVE);
});
