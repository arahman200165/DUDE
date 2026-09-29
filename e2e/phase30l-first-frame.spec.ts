import { expect, test, type Browser, type BrowserContext } from '@playwright/test';
import { APPEARANCE_STORAGE_KEY, loadTokens } from './appearance/combos';
import {
  attrMismatches,
  collectConsoleErrors,
  focusRingVisible,
  gotoSettled,
  installPrepaintProbe,
  noHorizontalOverflow,
  nonExemptAnimations,
  readPrepaint,
} from './appearance/checks';
import { PALETTE_INPUT } from './phase30l-helpers';

// Phase 30L.4 + exit criterion 5: representative appearances x the first-frame display matrix.
// Builds on (does not replace) `npm run test:appearance`, which sweeps every color combination.

const tokens = loadTokens();
const DEFAULT_ATTRS = Object.fromEntries(Object.values(tokens.axes).map((axis) => [axis.attr, axis.default]));
const defaultPrefs = {
  mode: 'dark',
  contrast: 'standard',
  accent: 'cyan',
  catset: 'vivid',
  semantic: 'standard',
  density: 'compact',
  uiSize: 'default',
  monoSize: 'default',
  ligatures: 'on',
  motion: 'allow',
  uiFont: tokens.fonts.defaultUi,
  monoFont: tokens.fonts.defaultMono,
};

interface Representative {
  name: string;
  /** Stored preference; `null` = a fresh install with nothing stored. */
  prefs: Record<string, string> | null;
  /** `data-*` attributes that must be on <html> at the first body element. Absent = must equal the default. */
  attrs: Record<string, string>;
  media?: { colorScheme?: 'light' | 'dark'; reducedMotion?: 'reduce' | 'no-preference' };
  reducedMotion?: boolean;
}

const curatedUi = tokens.fonts.ui.find((f: { id: string }) => f.id !== tokens.fonts.defaultUi)?.id ?? tokens.fonts.defaultUi;
const curatedMono = tokens.fonts.mono.find((f: { id: string }) => f.id !== tokens.fonts.defaultMono)?.id ?? tokens.fonts.defaultMono;

const REPRESENTATIVES: Representative[] = [
  { name: 'default dark compact (fresh install)', prefs: null, attrs: {} },
  {
    name: 'light comfortable large-ui curated-fonts',
    prefs: { ...defaultPrefs, mode: 'light', density: 'comfortable', uiSize: 'large', uiFont: curatedUi, monoFont: curatedMono },
    attrs: { 'data-theme': 'light', 'data-density': 'comfortable', 'data-ui-size': 'large', 'data-ui-font': curatedUi, 'data-mono-font': curatedMono },
  },
  {
    name: 'dark high-contrast ultra-compact reduced-motion',
    prefs: { ...defaultPrefs, contrast: 'high', density: 'ultra', motion: 'reduce' },
    attrs: { 'data-theme': 'dark', 'data-contrast': 'high', 'data-density': 'ultra', 'data-motion': 'reduce' },
    reducedMotion: true,
  },
  {
    name: 'light high-contrast color-blind-safe',
    prefs: { ...defaultPrefs, mode: 'light', contrast: 'high', catset: 'cvd', semantic: 'cvd' },
    attrs: { 'data-theme': 'light', 'data-contrast': 'high', 'data-catset': 'cvd', 'data-semantic': 'cvd' },
  },
  {
    name: 'system mode with OS light + reduced motion',
    prefs: { ...defaultPrefs, mode: 'system', contrast: 'system', motion: 'system' },
    attrs: { 'data-theme': 'light', 'data-motion': 'reduce' },
    media: { colorScheme: 'light', reducedMotion: 'reduce' },
    reducedMotion: true,
  },
];

const DISPLAYS = [
  { label: '1920x1080', width: 1920, height: 1080, deviceScaleFactor: 1 },
  { label: '1440x900', width: 1440, height: 900, deviceScaleFactor: 1 },
  { label: '1366x768', width: 1366, height: 768, deviceScaleFactor: 1 },
  { label: '1366x768@1.25x', width: 1366, height: 768, deviceScaleFactor: 1.25 },
  { label: '1366x768@1.5x', width: 1366, height: 768, deviceScaleFactor: 1.5 },
];

async function newContext(browser: Browser, rep: Representative, display: (typeof DISPLAYS)[number]): Promise<BrowserContext> {
  const context = await browser.newContext({
    viewport: { width: display.width, height: display.height },
    deviceScaleFactor: display.deviceScaleFactor,
    colorScheme: rep.media?.colorScheme ?? 'dark',
    reducedMotion: rep.media?.reducedMotion ?? 'no-preference',
  });
  if (rep.prefs) {
    await context.addInitScript(
      ({ key, prefs }) => {
        try {
          localStorage.setItem(key, JSON.stringify(prefs));
        } catch {
          /* no storage */
        }
      },
      { key: APPEARANCE_STORAGE_KEY, prefs: rep.prefs },
    );
  }
  await installPrepaintProbe(context);
  return context;
}

for (const rep of REPRESENTATIVES) {
  test.describe(rep.name, () => {
    for (const display of DISPLAYS) {
      test(`Home + Browse Tools first frame at ${display.label}`, async ({ browser }) => {
        test.setTimeout(90_000);
        const context = await newContext(browser, rep, display);
        const page = await context.newPage();
        const errors = collectConsoleErrors(page);
        try {
          for (const route of ['/DUDE/', '/DUDE/tools']) {
            const at = `${rep.name} @ ${display.label} ${route}`;
            await gotoSettled(page, route);

            // Pre-paint: attributes right at the first body element, and unchanged after Angular boots.
            const reading = await readPrepaint(page);
            // A fresh install may leave attributes absent (= default); a stored appearance must be applied explicitly.
            const expectedAttrs = rep.prefs === null ? DEFAULT_ATTRS : rep.attrs;
            const firstProblems = attrMismatches(reading.first, expectedAttrs, rep.prefs === null ? DEFAULT_ATTRS : undefined);
            expect.soft(firstProblems, `${at}: pre-paint attributes at first paint`).toEqual([]);
            expect.soft(attrMismatches(reading.final, expectedAttrs, DEFAULT_ATTRS), `${at}: post-boot attributes`).toEqual([]);

            // No horizontal overflow at page level.
            const overflow = await noHorizontalOverflow(page);
            expect.soft(overflow.ok, `${at}: no horizontal overflow (scrollWidth ${overflow.scrollWidth} > ${overflow.innerWidth}; ${overflow.culprit})`).toBe(true);

            // Sidebar is bounded and collapsed by default; the complete catalog stays one link away.
            const sidebar = await page.evaluate(() => {
              const el = document.querySelector('app-sidebar') as HTMLElement;
              const r = el.getBoundingClientRect();
              return {
                height: r.height,
                scrollHeight: el.scrollHeight,
                innerHeight: window.innerHeight,
                toolLinks: el.querySelectorAll('a[href*="/tools/"]').length,
                expanded: el.querySelectorAll('[aria-expanded="true"]').length,
              };
            });
            expect.soft(sidebar.height, `${at}: sidebar fits the viewport height`).toBeLessThanOrEqual(sidebar.innerHeight + 1);
            expect.soft(sidebar.scrollHeight, `${at}: sidebar content is bounded (scrollHeight ${sidebar.scrollHeight})`).toBeLessThanOrEqual(sidebar.innerHeight * 4);
            expect.soft(sidebar.toolLinks, `${at}: categories collapsed by default (tool links in sidebar)`).toBeLessThanOrEqual(15);
            expect.soft(sidebar.expanded, `${at}: no category expanded by default`).toBe(0);

            const browseLink = page.locator('app-sidebar a[href$="/DUDE/tools"]').first();
            await expect.soft(browseLink, `${at}: Browse Tools link is in the sidebar`).toBeVisible();
            await browseLink.focus();
            const box = await browseLink.boundingBox();
            const inView = !!box && box.y >= 0 && box.y + box.height <= display.height + 1 && box.x >= 0 && box.x + box.width <= display.width + 1;
            expect.soft(inView, `${at}: Browse Tools link is inside the viewport once focused (${JSON.stringify(box)})`).toBe(true);

            // Keyboard: Tab moves focus and it has a visible indicator (matrix focus check).
            const ring = await focusRingVisible(page);
            expect.soft(ring.problems, `${at}: focus indicator on ${ring.element}`).toEqual([]);

            // Ctrl+K opens the palette.
            await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
            await page.keyboard.press('Control+K');
            await expect.soft(page.locator(PALETTE_INPUT), `${at}: Ctrl+K opens the palette`).toBeVisible({ timeout: 5_000 });
            await page.keyboard.press('Escape');
            await expect.soft(page.locator(PALETTE_INPUT), `${at}: Escape closes the palette`).toBeHidden({ timeout: 5_000 });

            if (rep.reducedMotion) {
              await page.waitForTimeout(150);
              expect.soft(await nonExemptAnimations(page), `${at}: no running animations under reduced motion`).toEqual([]);
            }
            expect.soft(errors.drain(), `${at}: console errors`).toEqual([]);
          }
        } finally {
          await context.close();
        }
      });
    }
  });
}
