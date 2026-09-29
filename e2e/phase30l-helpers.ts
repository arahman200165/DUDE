import * as fs from 'node:fs';
import * as path from 'node:path';
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';

/** Shared helpers for the Phase 30L integrated workbench gate (see DUDE_PRD.md Phase 30L). */

export const PALETTE_INPUT = 'input[placeholder^="Search tools and commands"]';
export const HOME_LAYOUT_KEY = 'dude:v1:__home-layout__:layout';
export const FAVORITES_KEY = 'dude:v1:__favorites__:pinned';
export const WORKSPACE_REOPEN_KEY = 'dude:v1:__workspace__:reopenOnRestart';
export const USAGE_KEY = 'dude:v1:__usage__:activity';

const repoRoot = path.resolve(__dirname, '..');

/** Ids of panel kinds declared `desktopOnly: true` in their `*.panel-manifest.ts`. */
export function desktopOnlyPanelIds(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.panel-manifest.ts')) {
        const text = fs.readFileSync(full, 'utf8');
        if (/desktopOnly:\s*true/.test(text)) {
          const id = /\bid:\s*'([^']+)'/.exec(text)?.[1];
          if (id) out.push(id);
        }
      }
    }
  };
  walk(path.join(repoRoot, 'src', 'app'));
  return out;
}

export interface OfflineMap {
  files: string[];
  tools: Record<string, { open: number[]; extra: number[] }>;
  shell: number[];
  groups: Record<string, { files: number[] }>;
}

export async function fetchOfflineMap(request: APIRequestContext): Promise<OfflineMap> {
  // Read the map from the server under test so it always matches the served chunks.
  const response = await request.get('/DUDE/offline-map.json');
  return (await response.json()) as OfflineMap;
}

/**
 * Chunks reachable through static imports from the entry script(s) of the served index.html. These are
 * loaded on every page (they are part of the shell's eager graph), so they can't be attributed to a
 * route; keeping them out of the tool-only set makes the assertion about lazy, route/panel-triggered loads.
 */
export async function eagerShellChunks(request: APIRequestContext): Promise<Set<string>> {
  const html = await (await request.get('/DUDE/')).text();
  const queue = [...html.matchAll(/(?:src|href)="([^"]*\.js)"/g)].map((m) => m[1].split('/').pop() ?? '');
  const seen = new Set<string>();
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (!file || seen.has(file)) continue;
    seen.add(file);
    const response = await request.get('/DUDE/' + file);
    if (!response.ok()) continue;
    const text = await response.text();
    for (const m of text.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) queue.push(m[1]);
  }
  return seen;
}

/** File names of chunks that belong only to tool implementations (not the shell, not the prefetched app group, not eagerly imported by main). */
export function toolOnlyChunks(map: OfflineMap, eager: Set<string> = new Set()): Set<string> {
  const exclude = new Set<number>([...map.shell, ...(map.groups['app']?.files ?? [])]);
  const toolIdx = new Set<number>();
  for (const t of Object.values(map.tools)) for (const i of [...t.open, ...t.extra]) if (!exclude.has(i)) toolIdx.add(i);
  return new Set([...toolIdx].map((i) => map.files[i]).filter((f) => !eager.has(f)));
}

/** Scroll every scrollable element to its bottom (triggers @defer on viewport and virtual lists). */
export async function scrollEverythingToBottom(page: Page): Promise<void> {
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('*'))) {
      if (el.scrollHeight > el.clientHeight + 2) {
        const oy = getComputedStyle(el).overflowY;
        if (oy === 'auto' || oy === 'scroll' || el === document.scrollingElement) el.scrollTop = el.scrollHeight;
      }
    }
  });
}

export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle', { timeout: 10_000 }).catch(() => undefined);
  await page.waitForTimeout(250);
}

/** Press Tab until the focused element matches `selector`; fails with the focus trail otherwise. */
export async function tabUntil(page: Page, selector: string, max = 160, key = 'Tab'): Promise<void> {
  const trail: string[] = [];
  for (let i = 0; i < max; i++) {
    const hit = await page.evaluate((sel) => document.activeElement?.matches(sel) ?? false, selector);
    if (hit) return;
    await page.keyboard.press(key);
    trail.push(await activeLabel(page));
  }
  const hit = await page.evaluate((sel) => document.activeElement?.matches(sel) ?? false, selector);
  if (hit) return;
  throw new Error(`Never reached "${selector}" by keyboard in ${max} presses. Last stops: ${trail.slice(-6).join(' | ')}`);
}

/** Like tabUntil, but matches the focused element's trimmed text (for buttons without a stable label/selector). */
export async function tabUntilText(page: Page, text: string, max = 300): Promise<void> {
  for (let i = 0; i <= max; i++) {
    if (await page.evaluate((t) => (document.activeElement?.textContent ?? '').trim() === t, text)) return;
    await page.keyboard.press('Tab');
  }
  throw new Error('Never reached a control with text "' + text + '" by keyboard');
}

export async function activeLabel(page: Page): Promise<string> {
  return page.evaluate(() => {
    const a = document.activeElement as HTMLElement | null;
    if (!a) return 'none';
    return `${a.tagName.toLowerCase()}[${a.getAttribute('aria-label') ?? a.getAttribute('placeholder') ?? (a.innerText ?? '').trim().slice(0, 24)}]`;
  });
}

export async function seedLocalStorage(context: BrowserContext, entries: Record<string, unknown>, onlyIfAbsent = true): Promise<void> {
  await context.addInitScript(
    ({ entries, onlyIfAbsent }) => {
      try {
        for (const [k, v] of Object.entries(entries)) {
          if (onlyIfAbsent && localStorage.getItem(k) !== null) continue;
          localStorage.setItem(k, JSON.stringify(v));
        }
      } catch {
        /* no storage */
      }
    },
    { entries, onlyIfAbsent },
  );
}

export interface SeedPanel {
  id: string;
  kindId: string;
  x: number;
  y: number;
  w: number;
  h: number;
  config?: Record<string, unknown>;
  visible?: boolean;
}

/** A customized Home layout store (wide + narrow), in the persisted format of home-layout-store.model.ts. */
export function customLayoutStore(panels: SeedPanel[], content: Record<string, unknown> = {}): Record<string, unknown> {
  const placements = panels.map(({ id, x, y, w, h }) => ({ id, x, y, w, h }));
  return {
    schemaVersion: 1,
    customized: true,
    narrowCustomized: false,
    instances: panels.map((p) => ({ id: p.id, kindId: p.kindId, config: p.config ?? {}, visible: p.visible !== false })),
    wide: placements,
    narrow: placements,
    content,
  };
}

export interface CellBox {
  kind: string;
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  textLength: number;
  hasMedia: boolean;
}

export async function homeCells(page: Page): Promise<{ canvas: { x: number; w: number } | null; cells: CellBox[] }> {
  return page.evaluate(() => {
    const canvas = document.querySelector('[data-testid="home-canvas"]');
    const cr = canvas?.getBoundingClientRect();
    const cells = Array.from(document.querySelectorAll<HTMLElement>('[data-panel-kind]')).map((el) => {
      const r = el.getBoundingClientRect();
      return {
        kind: el.dataset['panelKind'] ?? '',
        id: el.dataset['panelInstance'] ?? '',
        x: r.x,
        y: r.y + window.scrollY,
        w: r.width,
        h: r.height,
        textLength: (el.innerText ?? '').trim().length,
        hasMedia: !!el.querySelector('svg, canvas, img, input, textarea, button, a'),
      };
    });
    return { canvas: cr ? { x: cr.x, w: cr.width } : null, cells };
  });
}
