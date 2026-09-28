import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PanelDefinition } from '../../shared/models/panel-definition.model';
import { PANEL_DEFINITIONS } from '../registry/panel-definitions';
import { buildDefaultLayout } from './default-layout';
import { GRID_COLUMNS, validateLayout } from './grid-engine';
import { defaultConfig, sanitizeConfig } from './panel-config';
import { panelAvailability, unavailableReason } from './panel-availability';
import { validatePanelDefinitions } from './panel-validation';

const load = () => Promise.resolve(null);
const def = (id: string, extra: Partial<PanelDefinition> = {}): PanelDefinition => ({
  id,
  title: id,
  description: `${id} panel`,
  load,
  size: { minW: 2, minH: 1 },
  dataDependencies: ['tool-registry'],
  ...extra,
});

function panelManifestFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((f) => f.endsWith('.panel-manifest.ts'))
    .map((f) => f.replace(/\\/g, '/'));
}

describe('real panel registry', () => {
  it('passes structural validation', () => {
    expect(validatePanelDefinitions(PANEL_DEFINITIONS)).toEqual([]);
  });

  it('has one definition per <kind-id>.panel-manifest.ts on disk, id matching the file name', () => {
    const files = panelManifestFiles(resolve(process.cwd(), 'src/app'));
    const ids = files.map((f) => f.split('/').pop()!.replace('.panel-manifest.ts', '')).sort();
    expect(PANEL_DEFINITIONS.map((d) => d.id).sort()).toEqual(ids);
  });

  it('never lists the panel suffix as a tool manifest', () => {
    const files = readdirSync(resolve(process.cwd(), 'src/app/tools'), { recursive: true, encoding: 'utf8' });
    expect(files.filter((f) => f.endsWith('.panel-manifest.ts'))).toEqual([]);
  });

  it('keeps the shipped default layout valid in both widths', () => {
    const layout = buildDefaultLayout(PANEL_DEFINITIONS);
    const byId = new Map(PANEL_DEFINITIONS.map((d) => [d.id, d.size]));
    const limits = (id: string) => byId.get(id)!;
    expect(validateLayout(layout.wide, limits)).toEqual([]);
    expect(validateLayout(layout.narrow, limits)).toEqual([]);
    expect(layout.wide.map((i) => i.id).sort()).toEqual(layout.narrow.map((i) => i.id).sort());
  });

  it('does not name a panel kind in core/home-layout sources', () => {
    const dir = resolve(process.cwd(), 'src/app/core/home-layout');
    const source = readdirSync(dir)
      .filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'))
      .map((f) => readFileSync(resolve(dir, f), 'utf8'))
      .join('\n');
    for (const d of PANEL_DEFINITIONS) expect(source).not.toContain(`'${d.id}'`);
  });
});

describe('validatePanelDefinitions', () => {
  it('flags duplicates, bad ids, and size problems', () => {
    const problems = validatePanelDefinitions([
      def('a'),
      def('a'),
      def('Bad_Id'),
      def('big', { size: { minW: 20, minH: 1 } }),
      def('inverted', { size: { minW: 4, minH: 1, maxW: 3 } }),
    ]);
    expect(problems.some((p) => p.includes('duplicate id'))).toBe(true);
    expect(problems.some((p) => p.includes('kebab-case'))).toBe(true);
    expect(problems.some((p) => p.includes('exceeds'))).toBe(true);
    expect(problems.some((p) => p.includes('maxW'))).toBe(true);
  });

  it('requires multi-instance kinds to be distinguishable and user kinds to declare user-content', () => {
    expect(validatePanelDefinitions([def('m', { multiInstance: true })])).toHaveLength(1);
    expect(validatePanelDefinitions([def('u', { multiInstance: true, userContent: 'text' })])).toHaveLength(1);
    expect(validatePanelDefinitions([def('u', { multiInstance: true, userContent: 'text', dataDependencies: ['user-content'] })])).toEqual([]);
  });

  it('checks default placement against size limits and config defaults', () => {
    const bad = def('p', {
      size: { minW: 4, minH: 2 },
      defaultPlacement: { order: 1, w: 2, h: 1 },
      config: [{ key: 'n', label: 'N', type: 'number', min: 1, max: 5, default: 9 }],
    });
    const problems = validatePanelDefinitions([bad]);
    expect(problems).toHaveLength(2);
  });

  it('requires "explain" panels to have a web-unavailable capability', () => {
    expect(validatePanelDefinitions([def('e', { webBehavior: 'explain' })])).toHaveLength(1);
  });

  it('rejects a replaced id that is still registered', () => {
    expect(validatePanelDefinitions([def('old'), def('new', { replaces: ['old'] })])).toHaveLength(1);
  });
});

describe('buildDefaultLayout', () => {
  it('packs by declared order, side by side where widths allow, and derives narrow', () => {
    const layout = buildDefaultLayout([
      def('c', { defaultPlacement: { order: 3, w: 12, h: 2 } }),
      def('a', { defaultPlacement: { order: 1, w: 6, h: 2 } }),
      def('b', { defaultPlacement: { order: 2, w: 6, h: 2 } }),
      def('hidden'),
    ]);
    expect(layout.instances.map((i) => i.id)).toEqual(['a', 'b', 'c']);
    expect(layout.wide).toEqual([
      { id: 'a', x: 0, y: 0, w: 6, h: 2 },
      { id: 'b', x: 6, y: 0, w: 6, h: 2 },
      { id: 'c', x: 0, y: 2, w: 12, h: 2 },
    ]);
    expect(layout.narrow.map((i) => [i.id, i.y, i.w])).toEqual([
      ['a', 0, 12],
      ['b', 2, 12],
      ['c', 4, 12],
    ]);
  });

  it('never places a later panel above an earlier one', () => {
    const layout = buildDefaultLayout([
      def('a', { defaultPlacement: { order: 1, w: 12, h: 3 } }),
      def('b', { defaultPlacement: { order: 2, w: 4, h: 1 } }),
      def('c', { defaultPlacement: { order: 3, w: 4, h: 1 } }),
    ]);
    expect(layout.wide.every((i) => i.x + i.w <= GRID_COLUMNS)).toBe(true);
    expect(layout.wide.find((i) => i.id === 'c')!.y).toBeGreaterThanOrEqual(layout.wide.find((i) => i.id === 'b')!.y);
  });

  it('seeds instance config from declared defaults', () => {
    const layout = buildDefaultLayout([
      def('r', { defaultPlacement: { order: 1, w: 6, h: 2 }, config: [{ key: 'limit', label: 'Limit', type: 'number', min: 1, max: 20, default: 8 }] }),
    ]);
    expect(layout.instances[0].config).toEqual({ limit: 8 });
  });
});

describe('panel config', () => {
  const fields = [
    { key: 'limit', label: 'Limit', type: 'number', min: 1, max: 20, default: 8 },
    { key: 'cat', label: 'Category', type: 'select', options: [{ value: 'data', label: 'Data' }], default: 'data' },
    { key: 'on', label: 'On', type: 'boolean', default: true },
  ] as const;

  it('provides defaults', () => {
    expect(defaultConfig(fields)).toEqual({ limit: 8, cat: 'data', on: true });
    expect(defaultConfig(undefined)).toEqual({});
  });

  it('clamps, falls back, and drops unknown keys without throwing', () => {
    expect(sanitizeConfig(fields, { limit: 99, cat: 'nope', on: 'x', extra: 1 })).toEqual({ limit: 20, cat: 'data', on: true });
    expect(sanitizeConfig(fields, { limit: 3.6, cat: 'data', on: false })).toEqual({ limit: 4, cat: 'data', on: false });
    expect(sanitizeConfig(fields, null)).toEqual({ limit: 8, cat: 'data', on: true });
    expect(sanitizeConfig(fields, [1, 2])).toEqual({ limit: 8, cat: 'data', on: true });
  });
});

describe('panelAvailability', () => {
  const desktopOnly = def('n', {
    capabilities: [{ id: 'native-fs', web: 'unavailable', note: 'Needs the desktop app.' }],
  });
  it('is always available on desktop', () => {
    expect(panelAvailability(desktopOnly, true)).toBe('available');
  });
  it('omits by default and explains on request on the web', () => {
    expect(panelAvailability(desktopOnly, false)).toBe('omit');
    expect(panelAvailability({ ...desktopOnly, webBehavior: 'explain' }, false)).toBe('explain');
    expect(unavailableReason(desktopOnly)).toBe('Needs the desktop app.');
  });
  it('treats fallback capabilities as available on the web', () => {
    const fb = def('f', { capabilities: [{ id: 'native-fs', web: 'fallback', note: 'x' }] });
    expect(panelAvailability(fb, false)).toBe('available');
  });
});
