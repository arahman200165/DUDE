import { expect, test, type Page } from '@playwright/test';
import {
  FAVORITES_KEY,
  HOME_LAYOUT_KEY,
  customLayoutStore,
  desktopOnlyPanelIds,
  homeCells,
  eagerShellChunks,
  fetchOfflineMap,
  scrollEverythingToBottom,
  seedLocalStorage,
  settle,
  toolOnlyChunks,
} from './phase30l-helpers';

// Phase 30L.1 (no tool implementation chunks on Home / Browse) and 30L.2 (web companion Home has
// no desktop-only panels and no blank holes), run against the production build.

let TOOL_ONLY = new Set<string>();

test.beforeAll(async ({ request }) => {
  TOOL_ONLY = toolOnlyChunks(await fetchOfflineMap(request), await eagerShellChunks(request));
});

function recordJsRequests(page: Page): string[] {
  const seen: string[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.pathname.endsWith('.js')) seen.push(url.pathname.split('/').pop() ?? '');
  });
  return seen;
}

const toolChunkHits = (seen: string[]): string[] => [...new Set(seen.filter((f) => TOOL_ONLY.has(f)))];

test.describe('30L.1 no tool implementation chunks on Home / Browse Tools', () => {
  test('the offline map yields a non-trivial tool-only chunk set', () => {
    expect(TOOL_ONLY.size).toBeGreaterThan(50);
  });

  test('Home (default layout, scrolled to the bottom) requests no tool-only chunk', async ({ page }) => {
    const seen = recordJsRequests(page);
    await page.goto('/DUDE/');
    await expect(page.locator('[data-testid="home-canvas"]')).toBeVisible();
    await settle(page);
    await scrollEverythingToBottom(page);
    await settle(page);
    expect(seen.length, 'the test observed JS requests at all').toBeGreaterThan(3);
    expect(toolChunkHits(seen)).toEqual([]);
  });

  test('Home with seeded favorites + usage (Quick Run scrolled into view) requests no tool-only chunk', async ({ page, context }) => {
    // Seed usage through the real product path (opening tools), then start recording on a fresh Home load.
    await seedLocalStorage(context, { [FAVORITES_KEY]: { schemaVersion: 1, toolIds: ['json', 'base64', 'regex'], pipelineIds: [] } });
    for (const id of ['base64', 'json', 'jwt']) {
      await page.goto(`/DUDE/tools/${id}`);
      await settle(page);
    }
    const seen = recordJsRequests(page);
    await page.goto('/DUDE/');
    await expect(page.locator('[data-testid="home-canvas"]')).toBeVisible();
    await page.locator('[data-panel-kind="quick-run"]').scrollIntoViewIfNeeded();
    await settle(page);
    await scrollEverythingToBottom(page);
    await settle(page);
    expect(toolChunkHits(seen)).toEqual([]);
  });

  test('Browse Tools (list scrolled to the bottom) requests no tool-only chunk', async ({ page }) => {
    const seen = recordJsRequests(page);
    await page.goto('/DUDE/tools');
    await expect(page.locator('app-data-table [role="row"]').first()).toBeVisible();
    await settle(page);
    await scrollEverythingToBottom(page);
    await settle(page);
    await page.getByRole('radio', { name: 'Grid' }).click();
    await expect(page.locator('app-tool-grid')).toBeVisible();
    await settle(page);
    await scrollEverythingToBottom(page);
    await settle(page);
    expect(seen.length).toBeGreaterThan(3);
    expect(toolChunkHits(seen)).toEqual([]);
  });

  test('sanity: opening a tool route DOES request a tool-only chunk (the check is not vacuous)', async ({ page }) => {
    const seen = recordJsRequests(page);
    await page.goto('/DUDE/tools/base64');
    await expect(page.getByRole('heading', { name: 'Base64 Encoder / Decoder' })).toBeVisible();
    await settle(page);
    expect(toolChunkHits(seen).length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------------------------

const DESKTOP_ONLY = desktopOnlyPanelIds();

function unionLength(ranges: [number, number][]): number {
  const sorted = [...ranges].sort((a, b) => a[0] - b[0]);
  let total = 0;
  let end = -Infinity;
  for (const [s, e] of sorted) {
    if (e <= end) continue;
    total += e - Math.max(s, end);
    end = e;
  }
  return total;
}

/** Every rendered slot has real height and content; every row band spans the canvas; no vertical gaps. */
async function expectNoHoles(page: Page, label: string): Promise<void> {
  const { canvas, cells } = await homeCells(page);
  expect(canvas, `${label}: home canvas rendered`).not.toBeNull();
  expect(cells.length, `${label}: at least one panel`).toBeGreaterThan(0);

  for (const cell of cells) {
    expect(cell.h, `${label}: ${cell.kind} has non-trivial height`).toBeGreaterThanOrEqual(24);
    expect(cell.w, `${label}: ${cell.kind} has non-trivial width`).toBeGreaterThanOrEqual(60);
    expect(cell.textLength > 0 || cell.hasMedia, `${label}: ${cell.kind} has visible content`).toBe(true);
  }

  // Group cells into vertical bands (overlapping y ranges), then check coverage and gaps.
  const sorted = [...cells].sort((a, b) => a.y - b.y || a.x - b.x);
  const bands: { top: number; bottom: number; cells: typeof cells }[] = [];
  for (const cell of sorted) {
    const last = bands[bands.length - 1];
    if (last && cell.y < last.bottom - 1) {
      last.cells.push(cell);
      last.bottom = Math.max(last.bottom, cell.y + cell.h);
    } else {
      bands.push({ top: cell.y, bottom: cell.y + cell.h, cells: [cell] });
    }
  }
  bands.forEach((band, i) => {
    const covered = unionLength(band.cells.map((c) => [c.x, c.x + c.w]));
    expect(covered, `${label}: band ${i} (${band.cells.map((c) => c.kind).join(', ')}) fills the canvas width ${Math.round(canvas!.w)}`).toBeGreaterThanOrEqual(canvas!.w * 0.95);
    if (i > 0) {
      expect(band.top - bands[i - 1].bottom, `${label}: vertical gap before band ${i} (${band.cells.map((c) => c.kind).join(', ')})`).toBeLessThanOrEqual(24);
    }
  });
}

test.describe('30L.2 web companion Home', () => {
  test('there are desktop-only panel kinds to omit (guards the manifest scan)', () => {
    expect(DESKTOP_ONLY.length).toBeGreaterThan(0);
  });

  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1366, height: 768 },
    { width: 640, height: 900 },
  ]) {
    test(`default Home renders no desktop-only panel and no blank hole at ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.goto('/DUDE/');
      await expect(page.locator('[data-testid="home-canvas"]')).toBeVisible();
      await settle(page);
      await scrollEverythingToBottom(page);
      await settle(page);
      const { cells } = await homeCells(page);
      expect(cells.map((c) => c.kind).filter((k) => DESKTOP_ONLY.includes(k))).toEqual([]);
      for (const id of DESKTOP_ONLY) await expect(page.locator(`[data-panel-kind="${id}"]`)).toHaveCount(0);
      await expectNoHoles(page, `default @${viewport.width}`);
    });
  }

  test('a custom layout with a desktop-only panel beside a web panel leaves no blank column', async ({ page, context }) => {
    test.skip(!DESKTOP_ONLY.includes('home-open-file'), 'home-open-file is not a desktop-only kind any more');
    await seedLocalStorage(context, {
      [HOME_LAYOUT_KEY]: customLayoutStore([
        { id: 'search1', kindId: 'home-search', x: 0, y: 0, w: 12, h: 1 },
        { id: 'open1', kindId: 'home-open-file', x: 0, y: 1, w: 3, h: 1 },
        { id: 'recent1', kindId: 'recent-tools', x: 3, y: 1, w: 9, h: 2 },
        { id: 'strip1', kindId: 'category-strip', x: 0, y: 3, w: 12, h: 1 },
      ]),
    });
    await page.goto('/DUDE/');
    await expect(page.locator('[data-testid="home-canvas"]')).toBeVisible();
    await settle(page);
    await expect(page.locator('[data-panel-kind="home-open-file"]')).toHaveCount(0);
    await expect(page.locator('[data-panel-kind="home-search"]')).toBeVisible();
    await expectNoHoles(page, 'custom with omitted desktop-only panel');
  });
});
