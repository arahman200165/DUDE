import { expect, test, type Page } from '@playwright/test';
import {
  FAVORITES_KEY,
  HOME_LAYOUT_KEY,
  PALETTE_INPUT,
  WORKSPACE_REOPEN_KEY,
  activeLabel,
  customLayoutStore,
  seedLocalStorage,
  settle,
  tabUntil,
  tabUntilText,
} from './phase30l-helpers';

// Phase 30L.5 -- Home / tool-browser keyboard acceptance. Everything after the initial navigation is
// driven through page.keyboard only (no pointer events). Default appearance, fresh context per test.

const favoritesSeed = { schemaVersion: 1, toolIds: ['json'], pipelineIds: [] };

async function gotoHome(page: Page): Promise<void> {
  await page.goto('/DUDE/');
  await expect(page.locator('[data-testid="home-canvas"]')).toBeVisible();
  await settle(page);
}

async function gotoBrowse(page: Page, query = ''): Promise<void> {
  await page.goto('/DUDE/tools' + query);
  await expect(page.getByRole('heading', { name: 'Browse Tools' })).toBeVisible();
  await expect(page.locator('app-data-table [role="row"]').first()).toBeVisible();
  await settle(page);
}

/** Tab until focus enters Smart Entry (the idle row expands on focus, so wait for the expansion to settle). */
async function tabToSmartEntry(page: Page): Promise<void> {
  for (let i = 0; i < 120; i++) {
    const inside = await page.evaluate(() => !!document.activeElement?.closest('app-home-paste-drop-hero'));
    if (inside) {
      await expect(page.locator('app-paste-detect-panel textarea')).toBeVisible();
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error('Tab never reached Smart Entry');
}

const blurAll = (page: Page): Promise<void> => page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());

async function expectPaletteOpenAndClosable(page: Page): Promise<void> {
  await blurAll(page);
  await page.keyboard.press('Control+K');
  const input = page.locator(PALETTE_INPUT);
  await expect(input).toBeVisible();
  await expect(input).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(input).toBeHidden();
}

test.describe('30L.5 keyboard acceptance -- Home', () => {
  test('1a. Smart Entry is reachable by Tab and expands when focused', async ({ page }) => {
    await gotoHome(page);
    await tabToSmartEntry(page);
    await expect(page.locator('app-paste-detect-panel textarea')).toBeVisible();
  });

  // BUG (found by this gate): the idle row expands on `focus`, which removes the focused row from the DOM
  // (@if (!expanded())), so keyboard focus falls back to <body>. A keyboard user who Tabs to Smart Entry
  // lands nowhere and cannot type/paste without another Tab, and Escape (bound on the expanded section)
  // does nothing because focus is outside it.
  test('1b. after Tab-focusing Smart Entry, focus lands inside the expanded Smart Entry (paste box)', async ({ page }) => {
    await gotoHome(page);
    await tabToSmartEntry(page);
    await expect(page.locator('app-paste-detect-panel textarea')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => !!document.activeElement?.closest('app-home-paste-drop-hero')), { message: 'focus stays inside Smart Entry' })
      .toBe(true);
    await page.keyboard.type('hello');
    await expect(page.locator('app-paste-detect-panel textarea')).toHaveValue('hello');
    await page.keyboard.press('Escape');
    await expect(page.locator('app-paste-detect-panel textarea')).toHaveCount(0);
  });

  test('2a. Ctrl+K opens and Escape closes the Command Palette on Home', async ({ page }) => {
    await gotoHome(page);
    await expectPaletteOpenAndClosable(page);
  });

  test('2b. Ctrl+K still works on Home with a custom layout installed', async ({ page, context }) => {
    await seedLocalStorage(context, {
      [HOME_LAYOUT_KEY]: customLayoutStore([
        { id: 'search1', kindId: 'home-search', x: 0, y: 0, w: 12, h: 1 },
        { id: 'sc1', kindId: 'user-shortcuts', x: 0, y: 1, w: 6, h: 2 },
        { id: 'fav1', kindId: 'favorites', x: 6, y: 1, w: 6, h: 2 },
      ]),
      [FAVORITES_KEY]: favoritesSeed,
    });
    await gotoHome(page);
    const kinds = await page.evaluate(() => Array.from(document.querySelectorAll('[data-panel-kind]')).map((e) => (e as HTMLElement).dataset['panelKind']));
    expect(kinds).toEqual(['home-search', 'user-shortcuts', 'favorites']);
    await expectPaletteOpenAndClosable(page);
    // And from inside a focused Home control, not just a blurred page.
    await tabUntil(page, '[data-panel-kind="favorites"] a');
    await page.keyboard.press('Control+K');
    await expect(page.locator(PALETTE_INPUT)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.locator(PALETTE_INPUT)).toBeHidden();
  });

  test('3a. a favorite tool opens from the Home panel with Tab + Enter', async ({ page, context }) => {
    await seedLocalStorage(context, { [FAVORITES_KEY]: favoritesSeed });
    await gotoHome(page);
    await tabUntil(page, '[data-panel-kind="favorites"] a[href$="/tools/json"]');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/DUDE\/tools\/json$/);
    await expect(page.getByRole('heading', { name: 'JSON Formatter' })).toBeVisible();
  });

  test('3b. a recent tool opens from the Home panel with Tab + Enter', async ({ page }) => {
    // Create the recent through the real product path: open the tool once, then go Home.
    await page.goto('/DUDE/tools/base64');
    await expect(page.getByRole('heading', { name: 'Base64 Encoder / Decoder' })).toBeVisible();
    await settle(page);
    await gotoHome(page);
    await tabUntil(page, '[data-panel-kind="recent-tools"] a[href$="/tools/base64"]');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/DUDE\/tools\/base64$/);
  });

  test('11. a seeded Shortcuts panel does not execute its targets on load; only an explicit activation does', async ({ page, context }) => {
    const dialogs: string[] = [];
    page.on('dialog', (dialog) => {
      dialogs.push(`${dialog.type()}: ${dialog.message()}`);
      void dialog.dismiss();
    });
    const shortcut = (id: string, kind: string, ref: string): Record<string, string> => ({ id, kind, ref, label: '' });
    await seedLocalStorage(context, {
      [HOME_LAYOUT_KEY]: customLayoutStore(
        [
          { id: 'search1', kindId: 'home-search', x: 0, y: 0, w: 12, h: 1 },
          { id: 'sc1', kindId: 'user-shortcuts', x: 0, y: 1, w: 12, h: 2 },
        ],
        {
          sc1: {
            kind: 'shortcut',
            title: 'Act',
            targets: [
              shortcut('t1', 'tool', 'base64'),
              shortcut('t2', 'destination', 'smart-paste'),
              shortcut('t3', 'command', 'preference:toggle-reopen-on-restart'),
              shortcut('t4', 'command', 'workspace:save-current'),
            ],
          },
        },
      ),
    });
    const navigations: string[] = [];
    page.on('framenavigated', (frame) => {
      if (frame === page.mainFrame()) navigations.push(new URL(frame.url()).pathname);
    });
    await gotoHome(page);
    await expect(page.locator('[data-panel-kind="user-shortcuts"] button', { hasText: 'Reopen Tabs on Restart' })).toBeVisible();
    // Give any (incorrect) on-mount execution time to happen.
    await page.waitForTimeout(600);
    expect(new URL(page.url()).pathname).toBe('/DUDE/');
    expect(navigations.every((p) => p === '/DUDE/')).toBe(true);
    expect(dialogs, 'no confirm/prompt appeared on load').toEqual([]);
    expect(await page.evaluate((k) => localStorage.getItem(k), WORKSPACE_REOPEN_KEY), 'the toggle command did not run on load (default stays true)').not.toBe('false');
    expect(await page.evaluate(() => localStorage.getItem('dude:v1:base64:mode'))).toBeNull();

    // Sanity: the shortcut is live -- keyboard activation runs the (non-navigating) preference command.
    await tabUntil(page, '[data-panel-kind="user-shortcuts"] button:not([disabled])');
    while (!(await page.evaluate(() => /Reopen Tabs on Restart/.test(document.activeElement?.textContent ?? '')))) {
      await page.keyboard.press('Tab');
    }
    await page.keyboard.press('Enter');
    await expect.poll(() => page.evaluate((k) => localStorage.getItem(k), WORKSPACE_REOPEN_KEY)).toBe('false');
    expect(new URL(page.url()).pathname).toBe('/DUDE/');
  });
});

test.describe('30L.5 keyboard acceptance -- Browse Tools and the palette', () => {
  test('4a. Browse Tools is reachable with Tab through the sidebar', async ({ page }) => {
    await gotoHome(page);
    await tabUntil(page, 'app-sidebar a[href$="/DUDE/tools"]');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/DUDE\/tools$/);
    await expect(page.getByRole('heading', { name: 'Browse Tools' })).toBeVisible();
  });

  test('4b. Browse Tools is reachable from Ctrl+K by typing its full name', async ({ page }) => {
    await gotoHome(page);
    await blurAll(page);
    await page.keyboard.press('Control+K');
    await expect(page.locator(PALETTE_INPUT)).toBeFocused();
    await page.keyboard.type('browse tools');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/DUDE\/tools$/);
  });

  // BUG (found by this gate): typing just "browse" and pressing Enter runs the top-ranked match, which is a
  // description/keyword hit (e.g. SQLite File Viewer) rather than the "Browse Tools" destination whose
  // title starts with the query. Title-prefix matches should outrank description matches.
  test('4c. Ctrl+K, "browse", Enter opens Browse Tools', async ({ page }) => {
    await gotoHome(page);
    await blurAll(page);
    await page.keyboard.press('Control+K');
    await page.keyboard.type('browse');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/DUDE\/tools$/);
  });

  test('5. typing in Browse search filters to a known registry tool (and "/" focuses the search)', async ({ page }) => {
    await gotoBrowse(page);
    await blurAll(page);
    await page.keyboard.press('/');
    await expect(page.getByLabel('Search tools')).toBeFocused();
    await page.keyboard.type('base64');
    const rows = page.locator('app-data-table').getByRole('link');
    await expect(rows.filter({ hasText: 'Base64 Encoder / Decoder' })).toBeVisible();
    await expect.poll(() => new URL(page.url()).searchParams.get('q')).toBe('base64');
    const count = await rows.count();
    expect(count).toBeGreaterThan(0);
    expect(count).toBeLessThan(40);
  });

  test('6. choosing a category with the keyboard filters the results and the URL', async ({ page }) => {
    await gotoBrowse(page);
    await tabUntil(page, 'app-disclosure button');
    await page.keyboard.press('Enter');
    await tabUntil(page, 'select[aria-label="Category"]');
    await page.keyboard.type('Security');
    await expect.poll(() => new URL(page.url()).searchParams.get('category')).toBe('security');
    const cells = page.locator('app-data-table [role="row"]');
    await expect(cells.first()).toBeVisible();
    await expect(page.locator('app-data-table')).toContainText('Security');
    const links = await page.locator('app-data-table').getByRole('link').count();
    expect(links).toBeGreaterThan(0);
    await expect(page.locator('app-data-table').getByRole('link', { name: 'Base64 Encoder / Decoder' })).toHaveCount(0);
    // Every visible row is in the chosen category.
    const categories = await page.locator('app-data-table [role="row"]').evaluateAll((rows) =>
      rows.map((r) => (r as HTMLElement).innerText).filter((t) => /Security|Data|Text|Encoding|Date|Web|Developer|Documents/.test(t)),
    );
    expect(categories.length).toBeGreaterThan(0);
    for (const text of categories) expect(text).toContain('Security');
  });

  test('7. ArrowDown + Enter in the search box opens the selected result', async ({ page }) => {
    await gotoBrowse(page, '?q=json');
    await page.getByLabel('Search tools').focus();
    const links = page.locator('app-data-table').getByRole('link');
    await expect(links.first()).toBeVisible();
    const hrefs = await links.evaluateAll((els) => els.map((e) => (e as HTMLAnchorElement).getAttribute('href')));
    expect(hrefs.length).toBeGreaterThan(2);
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${hrefs[2]!.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}$`));
  });

  test('7b. Enter with no arrow key opens the first result', async ({ page }) => {
    await gotoBrowse(page, '?q=base64');
    await page.getByLabel('Search tools').focus();
    const first = await page.locator('app-data-table').getByRole('link').first().getAttribute('href');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`${first!.replace(/\//g, '\\/')}$`));
  });

  test('8. the favorite star is keyboard operable (Space and Enter) and persists', async ({ page }) => {
    await gotoBrowse(page, '?q=base64');
    const star = page.locator('app-data-table button[aria-label^="Favorite "]').first();
    await expect(star).toHaveAttribute('aria-pressed', 'false');
    await tabUntil(page, 'app-data-table button[aria-label^="Favorite "], app-data-table button[aria-label^="Unfavorite "]');
    await page.keyboard.press('Space');
    const pressed = page.locator('app-data-table button[aria-pressed="true"]').first();
    await expect(pressed).toBeVisible();
    await expect(pressed).toHaveAttribute('aria-label', /^Unfavorite /);
    const stored = await page.evaluate((k) => localStorage.getItem(k), FAVORITES_KEY);
    expect(JSON.parse(stored!).toolIds.length).toBe(1);
    await page.keyboard.press('Enter');
    await expect(page.locator('app-data-table button[aria-pressed="true"]')).toHaveCount(0);
    expect(JSON.parse((await page.evaluate((k) => localStorage.getItem(k), FAVORITES_KEY))!).toolIds).toEqual([]);
  });

  test('9a. Escape closes the palette and returns focus somewhere sensible', async ({ page }) => {
    await gotoBrowse(page);
    await page.getByLabel('Search tools').focus();
    await page.keyboard.press('Control+K');
    await expect(page.locator(PALETTE_INPUT)).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.locator(PALETTE_INPUT)).toBeHidden();
    // Focus must not be dumped on <body>: a keyboard user should keep their place.
    await expect.poll(() => activeLabel(page), { message: 'focus after closing the palette' }).not.toMatch(/^body/);
  });

  test('9b. Escape in the Browse search box clears the query and every facet (documented behavior)', async ({ page }) => {
    await gotoBrowse(page, '?q=json&category=data&platform=browser');
    const search = page.getByLabel('Search tools');
    await search.focus();
    await expect(search).toHaveValue('json');
    await page.keyboard.press('Escape');
    await expect(search).toHaveValue('');
    await expect.poll(() => new URL(page.url()).search).toBe('');
    await expect(page.getByRole('radio', { name: 'Works fully in browser' })).toHaveAttribute('aria-checked', 'false');
    // Still focused in the search box, so a second Escape is a harmless no-op rather than leaving the page.
    await expect(search).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('heading', { name: 'Browse Tools' })).toBeVisible();
  });

  // Observed behavior (flagged in the gate report as unpredictable): Escape only clears filters while the
  // search input has focus. With focus on a facet control (Category select, Favorites chip, ...) the same
  // key does nothing, so the same key means "clear everything" in one place and nothing a Tab away.
  test('9c. Escape clears active filters from any Browse Tools control, not just the search box', async ({ page }) => {
    await gotoBrowse(page, '?q=json&category=data');
    await tabUntil(page, 'button[aria-pressed]');
    await page.keyboard.press('Escape');
    await expect.poll(() => new URL(page.url()).search).toBe('');
  });
});

test.describe('30L.5 keyboard acceptance -- Settings Home layout editor (list/form path)', () => {
  test('10. add, move, resize, hide, edit and remove a panel with the keyboard, save, and Home reflects it', async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto('/DUDE/settings/home-layout');
    await expect(page.getByRole('heading', { name: /Panels on Home/ })).toBeVisible();
    await settle(page);
    const rows = page.locator('[data-panel-row]');
    const before = await rows.count();

    const press = async (selector: string, key = 'Enter'): Promise<void> => {
      await tabUntil(page, selector, 700);
      await page.keyboard.press(key);
    };

    // Add a Shortcuts panel (appended to the end of the list).
    await press('button[aria-label="Add Shortcuts"]');
    await expect(rows).toHaveCount(before + 1);
    await expect(rows.last()).toContainText('Shortcuts');

    // Move it earlier by one position.
    await press('button[aria-label="Move Shortcuts earlier"]');
    await expect(rows.nth(before - 1)).toContainText('Shortcuts');

    // Resize: width 6 -> 4 via the number field (Enter commits a number input's change event).
    await tabUntil(page, '[data-panel-row^="user-shortcuts"] input[type="number"]', 700);
    await page.keyboard.press('Tab'); // Row
    await page.keyboard.press('Tab'); // Width
    await page.keyboard.press('Control+A');
    await page.keyboard.type('4');
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-panel-row^="user-shortcuts"]')).toContainText('×');
    await expect(page.locator('[data-panel-row^="user-shortcuts"]')).toContainText(/4×\d+ cells/);

    // Hide Quick Run (checkbox toggled with Space).
    await tabUntil(page, '[data-panel-row="quick-run"] input[type="checkbox"]', 700);
    await page.keyboard.press('Space');
    await expect(page.locator('[data-panel-row="quick-run"]')).toContainText('Hidden');

    // Edit the Text note panel: open its editor and type a title.
    await press('button[aria-label="Edit Text note"]');
    const titleField = page.locator('[data-panel-row="user-text"] app-user-content-editor input[type="text"]').first();
    await expect(titleField).toBeVisible();
    await titleField.focus();
    await page.keyboard.type('Gate note');

    // Remove the Link list panel.
    await press('button[aria-label="Remove Link list"]');
    await expect(page.locator('[data-panel-row="user-links"]')).toHaveCount(0);

    // Save.
    await tabUntilText(page, 'Save layout');
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('layout-status')).toContainText(/saved/i);

    // Home reflects the saved arrangement.
    await gotoHome(page);
    const kinds = await page.evaluate(() => Array.from(document.querySelectorAll('[data-panel-kind]')).map((e) => (e as HTMLElement).dataset['panelKind']));
    expect(kinds).toContain('user-shortcuts');
    expect(kinds).toContain('user-text');
    expect(kinds).not.toContain('quick-run');
    expect(kinds).not.toContain('user-links');
    await expect(page.locator('[data-panel-kind="user-text"]')).toContainText('Gate note');
  });
});
