import { describe, expect, it } from 'vitest';
import type { PanelDefinition } from "./panel-definition.model.js";
import { panelAvailability } from "@dude/tool-engine/core/home-layout/panel-availability";
import { NARROW_MAX_PX, resolveCells, widthOf } from "@dude/tool-engine/core/home-layout/home-cells";
import type { HomeLayout } from "../../core/home-layout/home-layout.model.js";

const load = () => Promise.resolve(null);
const def = (id: string, extra: Partial<PanelDefinition> = {}): PanelDefinition => ({
  id,
  title: id,
  description: id,
  load,
  size: { minW: 2, minH: 1 },
  dataDependencies: [],
  ...extra,
});
const defs = [
  def('a'),
  def('b'),
  def('desktop', { desktopOnly: true }),
  def('explainer', { desktopOnly: true, webBehavior: 'explain' }),
  def('empty', { showWhen: () => false }),
];
const inst = (id: string, visible = true) => ({ id, kindId: id, config: {}, visible });

const layout: HomeLayout = {
  instances: [inst('a'), inst('desktop'), inst('b'), inst('explainer'), inst('empty'), inst('ghost')],
  wide: [
    { id: 'a', x: 0, y: 0, w: 12, h: 2 },
    { id: 'desktop', x: 0, y: 2, w: 12, h: 2 },
    { id: 'b', x: 0, y: 4, w: 12, h: 2 },
    { id: 'explainer', x: 0, y: 6, w: 12, h: 1 },
    { id: 'empty', x: 0, y: 7, w: 12, h: 2 },
    { id: 'ghost', x: 0, y: 9, w: 12, h: 2 },
  ],
  narrow: [
    { id: 'b', x: 0, y: 0, w: 12, h: 2 },
    { id: 'a', x: 0, y: 2, w: 12, h: 2 },
  ],
};
const resolvers = (isDesktop: boolean) => ({
  definitionOf: (k: string) => defs.find((d) => d.id === k),
  availabilityOf: (d: PanelDefinition) => panelAvailability(d, isDesktop),
  shouldShow: (d: PanelDefinition) => d.showWhen?.() ?? true,
});

describe('widthOf', () => {
  it('uses narrow below the breakpoint and wide otherwise (and before the first measurement)', () => {
    expect(widthOf(0)).toBe('wide');
    expect(widthOf(NARROW_MAX_PX - 1)).toBe('narrow');
    expect(widthOf(NARROW_MAX_PX)).toBe('wide');
  });
});

describe('resolveCells', () => {
  it('on the web omits desktop-only, empty and dormant panels and closes the gaps', () => {
    const cells = resolveCells(layout, 'wide', resolvers(false));
    expect(cells.map((c) => [c.instance.id, c.availability, c.placement.y])).toEqual([
      ['a', 'available', 0],
      ['b', 'available', 2],
      ['explainer', 'explain', 4],
    ]);
  });
  it('on desktop keeps desktop-only panels but still drops empty and unknown ones', () => {
    const cells = resolveCells(layout, 'wide', resolvers(true));
    expect(cells.map((c) => c.instance.id)).toEqual(['a', 'desktop', 'b', 'explainer']);
  });
  it('drops user-hidden panels and lets neighbours rise', () => {
    const hidden = { ...layout, instances: layout.instances.map((i) => (i.id === 'a' ? { ...i, visible: false } : i)) };
    const cells = resolveCells(hidden, 'wide', resolvers(true));
    expect(cells[0].instance.id).toBe('desktop');
    expect(cells[0].placement.y).toBe(0);
  });
  it('uses the narrow placements independently and skips instances without one', () => {
    const cells = resolveCells(layout, 'narrow', resolvers(true));
    expect(cells.map((c) => c.instance.id)).toEqual(['b', 'a']);
  });
  it('never calls showWhen for a panel that is already unavailable', () => {
    let called = false;
    const spy = def('web-gated', { desktopOnly: true, showWhen: () => (called = true) });
    const l: HomeLayout = { instances: [inst('web-gated')], wide: [{ id: 'web-gated', x: 0, y: 0, w: 6, h: 1 }], narrow: [] };
    resolveCells(l, 'wide', { ...resolvers(false), definitionOf: () => spy });
    expect(called).toBe(false);
  });
});
