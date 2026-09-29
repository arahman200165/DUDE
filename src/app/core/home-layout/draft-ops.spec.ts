import { describe, expect, it } from 'vitest';
import type { PanelDefinition } from '../../shared/models/panel-definition.model';
import { buildDefaultLayout } from './default-layout';
import {
  addPanel,
  draftFromLayout,
  draftIssues,
  draftSignature,
  followWide,
  duplicatePanel,
  movePanel,
  placePanel,
  removePanel,
  resizePanel,
  setConfigValue,
  setContent,
  setVisible,
} from './draft-ops';

const load = () => Promise.resolve(null);
const kinds: PanelDefinition[] = [
  { id: 'a', title: 'Alpha', description: 'a', load, size: { minW: 3, minH: 2, maxW: 8 }, dataDependencies: [], defaultPlacement: { order: 1, w: 6, h: 2 } },
  { id: 'b', title: 'Beta', description: 'b', load, size: { minW: 3, minH: 2 }, dataDependencies: [], defaultPlacement: { order: 2, w: 6, h: 2 } },
  {
    id: 'multi',
    title: 'Multi',
    description: 'm',
    load,
    size: { minW: 3, minH: 2 },
    multiInstance: true,
    config: [{ key: 'limit', label: 'L', type: 'number', min: 1, max: 10, default: 5 }],
    dataDependencies: [],
  },
  { id: 'note', title: 'Note', description: 'n', load, size: { minW: 3, minH: 2 }, multiInstance: true, userContent: 'text', dataDependencies: ['user-content'] },
];
const lookup = (id: string) => kinds.find((k) => k.id === id);
const base = () => {
  const layout = buildDefaultLayout(kinds);
  return draftFromLayout(layout, false, {});
};
let n = 0;
const nextId = () => `id-${++n}`;

describe('addPanel', () => {
  it('adds at the bottom of both widths and follows wide for narrow until customized', () => {
    const r = addPanel(base(), kinds[2], lookup, nextId);
    expect(r.ok).toBe(true);
    expect(r.draft.instances.map((i) => i.kindId)).toEqual(['a', 'b', 'multi']);
    expect(r.draft.wide.find((i) => i.id === 'multi')!.y).toBeGreaterThanOrEqual(2);
    expect(r.draft.narrow.map((i) => i.id)).toContain('multi');
    expect(draftIssues(r.draft, lookup)).toEqual([]);
    expect(r.draft.instances[2].config).toEqual({ limit: 5 });
  });
  it('refuses a second instance of a single-instance kind', () => {
    const r = addPanel(base(), kinds[0], lookup);
    expect(r).toMatchObject({ ok: false, message: 'Alpha is already on Home.' });
  });
  it('gives extra instances of multi kinds fresh unique ids', () => {
    const one = addPanel(base(), kinds[2], lookup, nextId).draft;
    const two = addPanel(one, kinds[2], lookup, nextId).draft;
    expect(new Set(two.instances.map((i) => i.id)).size).toBe(4);
  });
});

describe('removePanel / setVisible', () => {
  it('removes from both widths and drops its content', () => {
    const withNote = addPanel(base(), kinds[3], lookup, nextId).draft;
    const id = withNote.instances[2].id;
    const filled = setContent(withNote, id, { kind: 'text', title: '', text: 'x' }).draft;
    const r = removePanel(filled, id, lookup);
    expect(r.draft.instances.map((i) => i.id)).not.toContain(id);
    expect(r.draft.wide.find((i) => i.id === id)).toBeUndefined();
    expect(r.draft.narrow.find((i) => i.id === id)).toBeUndefined();
    expect(r.draft.content[id]).toBeUndefined();
  });
  it('hides without discarding placement', () => {
    const r = setVisible(base(), 'a', false, lookup);
    expect(r.draft.instances.find((i) => i.id === 'a')!.visible).toBe(false);
    expect(r.draft.wide.find((i) => i.id === 'a')).toBeDefined();
    expect(r.message).toBe('Alpha hidden.');
  });
});

describe('duplicatePanel', () => {
  it('copies config and content into a new instance placed without overlap', () => {
    let d = addPanel(base(), kinds[3], lookup, nextId).draft;
    const id = d.instances[2].id;
    d = setContent(d, id, { kind: 'text', title: 'T', text: 'hello' }).draft;
    const r = duplicatePanel(d, id, lookup, nextId);
    expect(r.ok).toBe(true);
    const copy = r.draft.instances[r.draft.instances.length - 1];
    expect(copy.id).not.toBe(id);
    expect(r.draft.content[copy.id]).toEqual(r.draft.content[id]);
    expect(draftIssues(r.draft, lookup)).toEqual([]);
  });
  it('refuses single-instance kinds', () => {
    expect(duplicatePanel(base(), 'a', lookup)).toMatchObject({ ok: false, message: 'Alpha can only appear once.' });
  });
});

describe('config', () => {
  it('validates against the kind schema', () => {
    const d = addPanel(base(), kinds[2], lookup, nextId).draft;
    const id = d.instances[2].id;
    expect(setConfigValue(d, id, 'limit', 99, lookup).draft.instances[2].config).toEqual({ limit: 10 });
    expect(setConfigValue(d, id, 'limit', 'x', lookup).draft.instances[2].config).toEqual({ limit: 5 });
    expect(setConfigValue(d, 'a', 'limit', 3, lookup).draft.instances[0].config).toEqual({});
  });
});

describe('movePanel', () => {
  it('swaps reading-order neighbours and reports edges', () => {
    const d = base();
    const later = movePanel(d, 'wide', 'a', 1, lookup);
    expect(later.ok).toBe(true);
    expect(later.draft.wide.find((i) => i.id === 'a')!.x).toBe(6);
    expect(movePanel(d, 'wide', 'a', -1, lookup)).toMatchObject({ ok: false, message: 'Alpha is already first.' });
    expect(movePanel(d, 'wide', 'b', 1, lookup)).toMatchObject({ ok: false, message: 'Beta is already last.' });
  });
  it('editing narrow detaches it from wide and leaves wide alone', () => {
    const d = base();
    const r = movePanel(d, 'narrow', 'b', -1, lookup);
    expect(r.ok).toBe(true);
    expect(r.draft.narrowCustomized).toBe(true);
    expect(r.draft.wide).toEqual(d.wide);
    expect(r.draft.narrow.find((i) => i.id === 'b')!.y).toBeLessThan(r.draft.narrow.find((i) => i.id === 'a')!.y);
  });
  it('wide edits keep flowing into an uncustomized narrow layout', () => {
    const d = base();
    const r = movePanel(d, 'wide', 'a', 1, lookup);
    expect(r.draft.narrowCustomized).toBe(false);
    expect(r.draft.narrow.map((i) => i.id)).toEqual(['b', 'a']);
  });
});

describe('placePanel / resizePanel', () => {
  it('accepts a valid resize and reports the resulting cells', () => {
    const r = resizePanel(base(), 'wide', 'a', { w: 4, h: 3 }, lookup);
    expect(r.ok).toBe(true);
    expect(r.message).toContain('4×3 cells');
    expect(r.draft.wide.find((i) => i.id === 'a')).toMatchObject({ w: 4, h: 3 });
  });
  it('refuses overlaps, too-small and too-large sizes, leaving the draft untouched', () => {
    const d = base();
    const overlap = resizePanel(d, 'wide', 'a', { w: 8, h: 2 }, lookup);
    expect(overlap).toMatchObject({ ok: false });
    expect(overlap.placement?.failure).toBe('overlap');
    expect(overlap.draft).toBe(d);
    expect(resizePanel(d, 'wide', 'a', { w: 1, h: 2 }, lookup).placement?.failure).toBe('too-small');
    expect(placePanel(d, 'wide', 'a', { x: 0, y: 0, w: 9, h: 2 }, lookup).placement?.failure).toBe('too-large');
    expect(placePanel(d, 'wide', 'a', { x: 10, y: 0, w: 4, h: 2 }, lookup).placement?.failure).toBe('out-of-bounds');
  });
});

describe('followWide', () => {
  it('discards a deliberate narrow arrangement and re-derives it from wide', () => {
    const detached = movePanel(base(), 'narrow', 'b', -1, lookup).draft;
    expect(detached.narrowCustomized).toBe(true);
    const r = followWide(detached, lookup);
    expect(r.draft.narrowCustomized).toBe(false);
    expect(r.draft.narrow.map((i) => i.id)).toEqual(['a', 'b']);
  });
});

describe('draftSignature', () => {
  it('ignores placement array order, so a just-saved draft is not dirty', () => {
    const d = base();
    expect(draftSignature({ ...d, wide: [...d.wide].reverse() })).toBe(draftSignature(d));
  });
  it('changes for real edits and ignores the derived narrow layout until it is customized', () => {
    const d = base();
    expect(draftSignature(resizePanel(d, 'wide', 'a', { w: 4, h: 2 }, lookup).draft)).not.toBe(draftSignature(d));
    expect(draftSignature({ ...d, narrow: [] })).toBe(draftSignature(d));
    const detached = movePanel(d, 'narrow', 'b', -1, lookup).draft;
    expect(draftSignature({ ...detached, narrow: [] })).not.toBe(draftSignature(detached));
  });
});
