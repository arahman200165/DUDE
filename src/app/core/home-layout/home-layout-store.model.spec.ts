import { describe, expect, it } from 'vitest';
import { buildDefaultLayout } from './default-layout';
import { validateLayout } from './grid-engine';
import {
  EMPTY_HOME_LAYOUT_DATA,
  HomeLayoutData,
  KindCatalog,
  KindInfo,
  contentAfterReset,
  effectiveLayout,
  isNewerHomeLayoutSchema,
  mergeHomeLayout,
  migrateHomeLayoutStore,
  sanitizeHomeLayoutData,
} from './home-layout-store.model';
import { PanelDefinition } from '../../shared/models/panel-definition.model';
import type { ShortcutContent } from './user-content.model';

const load = () => Promise.resolve(null);
const kinds: PanelDefinition[] = [
  { id: 'rail', title: 'Rail', description: 'r', load, size: { minW: 3, minH: 2 }, dataDependencies: ['usage'], defaultPlacement: { order: 1, w: 6, h: 2 } },
  { id: 'recent', title: 'Recent', description: 'r', load, size: { minW: 3, minH: 2 }, dataDependencies: ['usage'], defaultPlacement: { order: 2, w: 6, h: 2 } },
  {
    id: 'cat',
    title: 'Cat',
    description: 'c',
    load,
    size: { minW: 3, minH: 2, maxW: 8 },
    multiInstance: true,
    config: [{ key: 'limit', label: 'L', type: 'number', min: 1, max: 10, default: 5 }],
    dataDependencies: ['tool-registry'],
  },
  { id: 'note', title: 'Note', description: 'n', load, size: { minW: 3, minH: 2 }, multiInstance: true, userContent: 'text', dataDependencies: ['user-content'] },
  { id: 'shortcuts', title: 'S', description: 's', load, size: { minW: 3, minH: 2 }, multiInstance: true, userContent: 'shortcut', dataDependencies: ['user-content'] },
  { id: 'renamed', title: 'New', description: 'n', load, size: { minW: 3, minH: 2 }, dataDependencies: ['usage'], replaces: ['old-name'] },
];
const catalog: KindCatalog = {
  resolve(id): KindInfo | undefined {
    return kinds.find((k) => k.id === id || (k.replaces ?? []).includes(id));
  },
};
const defaults = buildDefaultLayout(kinds);
let n = 0;
const nextId = () => `gen-${++n}`;

const custom = (over: Record<string, unknown>) => ({
  customized: true,
  narrowCustomized: true,
  instances: [
    { id: 'rail', kindId: 'rail', config: {}, visible: true },
    { id: 'cat-1', kindId: 'cat', config: { limit: 3 }, visible: true },
  ],
  wide: [
    { id: 'rail', x: 0, y: 0, w: 6, h: 2 },
    { id: 'cat-1', x: 6, y: 0, w: 6, h: 2 },
  ],
  narrow: [
    { id: 'cat-1', x: 0, y: 0, w: 12, h: 2 },
    { id: 'rail', x: 0, y: 2, w: 12, h: 2 },
  ],
  content: {},
  ...over,
});

describe('sanitizeHomeLayoutData', () => {
  it('returns the untouched state for junk and never throws', () => {
    for (const junk of [null, undefined, 5, 'x', [], { customized: 'yes' }]) {
      expect(sanitizeHomeLayoutData(junk, catalog, defaults)).toEqual(EMPTY_HOME_LAYOUT_DATA);
    }
  });

  it('keeps a valid layout and sanitizes per-instance config against the kind schema', () => {
    const out = sanitizeHomeLayoutData(custom({ instances: [{ id: 'cat-1', kindId: 'cat', config: { limit: 99, junk: 1 }, visible: false }], wide: [], narrow: [] }), catalog, defaults);
    expect(out.instances).toEqual([{ id: 'cat-1', kindId: 'cat', config: { limit: 10 }, visible: false }]);
    expect(out.wide).toHaveLength(1);
    expect(out.narrow).toHaveLength(1);
  });

  it('maps renamed kinds through `replaces` and keeps removed kinds as dormant instances', () => {
    const out = sanitizeHomeLayoutData(
      custom({
        instances: [
          { id: 'a', kindId: 'old-name', config: {}, visible: true },
          { id: 'b', kindId: 'long-gone', config: { x: 1 }, visible: true },
        ],
        wide: [],
        narrow: [],
      }),
      catalog,
      defaults,
    );
    expect(out.instances.map((i) => [i.id, i.kindId])).toEqual([
      ['a', 'renamed'],
      ['b', 'long-gone'],
    ]);
    expect(out.instances[1].config).toEqual({});
    expect(out.wide.map((i) => i.id).sort()).toEqual(['a', 'b']);
  });

  it('drops duplicate single-instance kinds, duplicate ids, and bad ids', () => {
    const out = sanitizeHomeLayoutData(
      custom({
        instances: [
          { id: 'rail', kindId: 'rail', config: {}, visible: true },
          { id: 'rail-2', kindId: 'rail', config: {}, visible: true },
          { id: 'rail', kindId: 'recent', config: {}, visible: true },
          { id: 'bad id!', kindId: 'recent', config: {}, visible: true },
        ],
      }),
      catalog,
      defaults,
    );
    expect(out.instances.map((i) => i.id)).toEqual(['rail']);
  });

  it('repairs overlapping, out-of-range, and missing placements without dropping instances', () => {
    const out = sanitizeHomeLayoutData(
      custom({
        wide: [
          { id: 'rail', x: 0, y: 0, w: 6, h: 2 },
          { id: 'cat-1', x: 3, y: 0, w: 99, h: 2 },
          { id: 'ghost', x: 0, y: 0, w: 1, h: 1 },
        ],
      }),
      catalog,
      defaults,
    );
    expect(out.wide.map((i) => i.id).sort()).toEqual(['cat-1', 'rail']);
    const limits = (id: string) => (id === 'cat-1' ? { minW: 3, minH: 2, maxW: 8 } : { minW: 3, minH: 2 });
    expect(validateLayout(out.wide, limits)).toEqual([]);
  });

  it('derives narrow from wide until the user customizes it', () => {
    const out = sanitizeHomeLayoutData(custom({ narrowCustomized: false, narrow: [{ id: 'rail', x: 0, y: 9, w: 3, h: 2 }] }), catalog, defaults);
    expect(out.narrow.every((i) => i.x === 0)).toBe(true);
    expect(out.narrow[0].w).toBeGreaterThanOrEqual(8);
  });

  it('keeps only content that matches its instance kind and re-sanitizes it', () => {
    const out = sanitizeHomeLayoutData(
      custom({
        instances: [
          { id: 'n1', kindId: 'note', config: {}, visible: true },
          { id: 'n2', kindId: 'note', config: {}, visible: true },
          { id: 'rail', kindId: 'rail', config: {}, visible: true },
        ],
        wide: [],
        narrow: [],
        content: {
          n1: { kind: 'text', title: 'T', text: '<img src=x onerror=alert(1)>' },
          n2: { kind: 'shortcut', title: '', targets: [{ kind: 'tool', ref: 'json' }] },
          rail: { kind: 'text', title: 'no', text: 'no' },
          orphan: { kind: 'text', title: 'x', text: 'x' },
        },
      }),
      catalog,
      defaults,
    );
    expect(Object.keys(out.content)).toEqual(['n1']);
    // Stored verbatim as text; rendering is text-only, so markup is inert.
    expect(out.content['n1']).toMatchObject({ kind: 'text', text: '<img src=x onerror=alert(1)>' });
  });

  it('rejects unsafe link schemes and unknown shortcut kinds in stored content', () => {
    const out = sanitizeHomeLayoutData(
      custom({
        instances: [
          { id: 'l1', kindId: 'note', config: {}, visible: true },
          { id: 's1', kindId: 'shortcuts', config: {}, visible: true },
        ],
        wide: [],
        narrow: [],
        content: {
          s1: {
            kind: 'shortcut',
            title: 'Go',
            targets: [
              { kind: 'tool', ref: 'json' },
              { kind: 'exec', ref: 'rm -rf' },
              { kind: 'tool', ref: 'json' },
              { kind: 'command', ref: 'x'.repeat(500) },
            ],
          },
        },
      }),
      catalog,
      defaults,
    );
    expect((out.content['s1'] as ShortcutContent).targets).toHaveLength(1);
  });

  it('attaches content to default instances while the layout is untouched', () => {
    const withDefaults = buildDefaultLayout([...kinds, { ...kinds[3], id: 'default-note', multiInstance: false, defaultPlacement: { order: 9, w: 6, h: 2 } }]);
    const out = sanitizeHomeLayoutData(
      { customized: false, content: { 'default-note': { kind: 'text', title: '', text: 'hi' }, nope: { kind: 'text', title: '', text: 'x' } } },
      { resolve: (id) => [...kinds, { ...kinds[3], id: 'default-note' }].find((k) => k.id === id) },
      withDefaults,
    );
    expect(Object.keys(out.content)).toEqual(['default-note']);
    expect(out.customized).toBe(false);
  });
});

describe('migrateHomeLayoutStore', () => {
  it('resets an older or garbage schema', () => {
    expect(migrateHomeLayoutStore({ schemaVersion: 0, ...custom({}) }, catalog, defaults).customized).toBe(false);
    expect(migrateHomeLayoutStore({ schemaVersion: 'x', ...custom({}) }, catalog, defaults).customized).toBe(false);
  });
  it('reads a newer schema best-effort with the fields it understands', () => {
    const out = migrateHomeLayoutStore({ schemaVersion: 99, futureField: 1, ...custom({}) }, catalog, defaults);
    expect(out.customized).toBe(true);
    expect(out.instances.map((i) => i.id)).toEqual(['rail', 'cat-1']);
    expect(isNewerHomeLayoutSchema({ schemaVersion: 2 })).toBe(true);
    expect(isNewerHomeLayoutSchema({ schemaVersion: 1 })).toBe(false);
  });
  it('accepts the current version', () => {
    expect(migrateHomeLayoutStore({ schemaVersion: 1, ...custom({}) }, catalog, defaults).customized).toBe(true);
  });
});

describe('effectiveLayout', () => {
  it('uses the manifest default until customized', () => {
    expect(effectiveLayout(EMPTY_HOME_LAYOUT_DATA, defaults, catalog)).toBe(defaults);
  });
  it('never gains newly added kinds once customized', () => {
    const data = sanitizeHomeLayoutData(custom({}), catalog, defaults);
    const layout = effectiveLayout(data, defaults, catalog);
    expect(layout.instances.map((i) => i.kindId)).toEqual(['rail', 'cat']);
  });
});

describe('contentAfterReset', () => {
  it('keeps content only for panels that exist in the default', () => {
    const content = { rail: { kind: 'text', title: '', text: 'k' }, 'note-9': { kind: 'text', title: '', text: 'gone' } } as const;
    expect(Object.keys(contentAfterReset(content, defaults))).toEqual(['rail']);
  });
});

describe('mergeHomeLayout', () => {
  const incoming = sanitizeHomeLayoutData(
    custom({
      instances: [{ id: 'n1', kindId: 'note', config: {}, visible: true }],
      wide: [{ id: 'n1', x: 0, y: 0, w: 6, h: 2 }],
      narrow: [{ id: 'n1', x: 0, y: 0, w: 12, h: 2 }],
      content: { n1: { kind: 'text', title: 'Imp', text: 'imported' } },
    }),
    catalog,
    defaults,
  );
  const existing = sanitizeHomeLayoutData(custom({}), catalog, defaults);

  it('adopts the import when nothing exists yet, and ignores an empty import', () => {
    expect(mergeHomeLayout(EMPTY_HOME_LAYOUT_DATA, incoming, 'skip', defaults, catalog)).toBe(incoming);
    expect(mergeHomeLayout(existing, EMPTY_HOME_LAYOUT_DATA, 'replace', defaults, catalog)).toBe(existing);
  });
  it('skip keeps and replace overwrites', () => {
    expect(mergeHomeLayout(existing, incoming, 'skip', defaults, catalog)).toBe(existing);
    expect(mergeHomeLayout(existing, incoming, 'replace', defaults, catalog)).toBe(incoming);
  });
  it('keep-both appends imported user panels with fresh ids and no overlap', () => {
    const merged: HomeLayoutData = mergeHomeLayout(existing, incoming, 'keep-both', defaults, catalog, nextId);
    expect(merged.instances).toHaveLength(3);
    const added = merged.instances[2];
    expect(added.id).not.toBe('n1');
    expect(merged.content[added.id]).toMatchObject({ text: 'imported' });
    const limits = () => ({ minW: 2, minH: 1 });
    expect(validateLayout(merged.wide, limits)).toEqual([]);
    expect(validateLayout(merged.narrow, limits)).toEqual([]);
  });
});
