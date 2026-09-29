import { expect, test, type Page } from '@playwright/test';
import { APPEARANCE_STORAGE_KEY, TOOL_IDS, VIEWPORTS, allCombos, layoutCombos, loadTokens, type AppearanceCombo } from './combos';
import {
  attrMismatches,
  collectConsoleErrors,
  focusRingVisible,
  gotoSettled,
  installPrepaintProbe,
  noHorizontalOverflow,
  readPrepaint,
  sampleTextContrast,
  type ConsoleCollector,
} from './checks';

const tokens = loadTokens();
const DEFAULT_ATTRS = Object.fromEntries(Object.values(tokens.axes).map((axis) => [axis.attr, axis.default]));
const PALETTE_INPUT = 'input[placeholder^="Search tools and commands"]';

function thresholds(combo: AppearanceCombo): [number, number] {
  return combo.values['contrast'] === 'high' ? [7, 4.5] : [4.5, 3];
}

/** Seed the appearance preference before any page script (incl. the inline pre-paint) runs. */
async function seed(page: Page, combo: AppearanceCombo): Promise<void> {
  await page.context().addInitScript(
    ({ key, prefs }) => {
      try {
        localStorage.setItem(key, JSON.stringify(prefs));
      } catch {
        /* opaque-origin frames have no storage */
      }
    },
    { key: APPEARANCE_STORAGE_KEY, prefs: combo.prefs },
  );
  await installPrepaintProbe(page.context());
}

async function checkPrepaint(page: Page, combo: AppearanceCombo): Promise<void> {
  const reading = await readPrepaint(page);
  expect.soft(attrMismatches(reading.first, combo.attrs), 'pre-paint <html> data-* at first body element').toEqual([]);
  expect.soft(attrMismatches(reading.final, combo.attrs, DEFAULT_ATTRS), 'post-boot <html> data-*').toEqual([]);
}

function reportContrast(result: Awaited<ReturnType<typeof sampleTextContrast>>): string[] {
  return result.failures.map((f) => `${f.selectorHint} "${f.text}" fg ${f.fg} on ${f.bg} = ${f.ratio}:1 (need ${f.required})`);
}

test.describe('appearance matrix (every axis combination)', () => {
  const combos = allCombos();
  combos.forEach((combo, index) => {
    test(combo.key, async ({ page }) => {
      test.setTimeout(180_000);
      const toolId = TOOL_IDS[index % TOOL_IDS.length];
      const [minNormal, minLarge] = thresholds(combo);
      const consoleErrors: ConsoleCollector = collectConsoleErrors(page);
      await seed(page, combo);

      const visit = async (label: string, path: string, opts: { focus: boolean }): Promise<void> => {
        await test.step(label, async () => {
          await gotoSettled(page, path);
          await checkPrepaint(page, combo);
          const overflow = await noHorizontalOverflow(page);
          expect.soft(overflow.ok, `no horizontal overflow (scrollWidth ${overflow.scrollWidth} > ${overflow.innerWidth}; ${overflow.culprit})`).toBe(true);
          const contrast = await sampleTextContrast(page, minNormal, minLarge);
          expect.soft(reportContrast(contrast), `text contrast (${contrast.checked} checked, ${contrast.failureCount} failing, ${contrast.skippedGradient} skipped for gradients)`).toEqual([]);
          if (opts.focus) {
            const ring = await focusRingVisible(page);
            expect.soft(ring.problems, `focus ring on ${ring.element}`).toEqual([]);
          }
          expect.soft(consoleErrors.drain(), 'console errors').toEqual([]);
        });
      };

      await visit('Home', '/DUDE/', { focus: true });

      await test.step('Command palette', async () => {
        // Still on Home: open the palette, check it and a populated result list, then close it.
        await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.());
        await page.keyboard.press('Control+K');
        const input = page.locator(PALETTE_INPUT);
        await expect.soft(input, 'command palette opens on Ctrl+K').toBeVisible({ timeout: 5_000 });
        if (await input.isVisible()) {
          await input.fill('js');
          await page.waitForTimeout(200);
          const paletteRoot = await input.evaluateHandle((el) => el.parentElement!);
          await paletteRoot.evaluate((el) => el.setAttribute('data-appearance-probe', 'palette'));
          const contrast = await sampleTextContrast(page, minNormal, minLarge, '[data-appearance-probe="palette"]');
          expect.soft(reportContrast(contrast), `palette text contrast (${contrast.checked} checked, ${contrast.failureCount} failing)`).toEqual([]);
          await page.keyboard.press('Escape');
          await expect.soft(input, 'command palette closes on Escape').toBeHidden({ timeout: 5_000 });
        }
        expect.soft(consoleErrors.drain(), 'console errors').toEqual([]);
      });

      await visit('Browse Tools', '/DUDE/tools', { focus: false });

      await test.step('Settings › Appearance', async () => {
        await gotoSettled(page, '/DUDE/settings/appearance');
        if (!/\/settings\/appearance\/?$/.test(page.url())) {
          test.info().annotations.push({ type: 'finding', description: `/settings/appearance did not stay on the route (landed on ${page.url()})` });
        } else if (await page.getByText(/not found/i).first().isVisible().catch(() => false)) {
          test.info().annotations.push({ type: 'finding', description: '/settings/appearance rendered a not-found page' });
        }
        await checkPrepaint(page, combo);
        const overflow = await noHorizontalOverflow(page);
        expect.soft(overflow.ok, `no horizontal overflow (scrollWidth ${overflow.scrollWidth} > ${overflow.innerWidth}; ${overflow.culprit})`).toBe(true);
        const contrast = await sampleTextContrast(page, minNormal, minLarge);
        expect.soft(reportContrast(contrast), `text contrast (${contrast.checked} checked, ${contrast.failureCount} failing, ${contrast.skippedGradient} skipped for gradients)`).toEqual([]);
        expect.soft(consoleErrors.drain(), 'console errors').toEqual([]);
      });

      await visit(`Tool ${toolId}`, `/DUDE/tools/${toolId}`, { focus: true });
    });
  });
});

test.describe('appearance layout sub-matrix (theme × contrast × density × viewport)', () => {
  const combos = layoutCombos();
  combos.forEach((combo, index) => {
    for (const viewport of VIEWPORTS) {
      test(`${combo.key} @ ${viewport.width}x${viewport.height}`, async ({ page }) => {
        test.setTimeout(180_000);
        await page.setViewportSize(viewport);
        const toolId = TOOL_IDS[index % TOOL_IDS.length];
        await seed(page, combo);
        const pages: [string, string][] = [
          ['Home', '/DUDE/'],
          ['Browse Tools', '/DUDE/tools'],
          ['Settings › Appearance', '/DUDE/settings/appearance'],
          [`Tool ${toolId}`, `/DUDE/tools/${toolId}`],
        ];
        for (const [label, path] of pages) {
          await test.step(label, async () => {
            await gotoSettled(page, path);
            const overflow = await noHorizontalOverflow(page);
            expect.soft(overflow.ok, `no horizontal overflow (scrollWidth ${overflow.scrollWidth} > ${overflow.innerWidth}; ${overflow.culprit})`).toBe(true);
            const ring = await focusRingVisible(page);
            expect.soft(ring.problems, `focus ring on ${ring.element}`).toEqual([]);
          });
        }
      });
    }
  });
});
