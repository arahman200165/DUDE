import { DEFAULT_GRID_CONTAINER, buildGridContainerCss, buildGridCss, buildGridHtml, buildGridItemCss } from "./css-grid-logic.js";

describe('buildGridContainerCss', () => {
  it('includes display: grid and template columns/rows', () => {
    const css = buildGridContainerCss(DEFAULT_GRID_CONTAINER);
    expect(css).toContain('display: grid;');
    expect(css).toContain('grid-template-columns: repeat(3, 1fr);');
  });
});

describe('buildGridItemCss', () => {
  it('omits grid-column/grid-row when both are auto', () => {
    expect(buildGridItemCss({ gridColumn: 'auto', gridRow: 'auto' })).toBe('');
  });

  it('includes grid-column when overridden', () => {
    expect(buildGridItemCss({ gridColumn: '1 / 3', gridRow: 'auto' })).toBe('grid-column: 1 / 3;');
  });
});

describe('buildGridCss', () => {
  it('omits per-item rules entirely when every item is auto-placed', () => {
    const css = buildGridCss(DEFAULT_GRID_CONTAINER, [{ gridColumn: 'auto', gridRow: 'auto' }]);
    expect(css).not.toContain('.item-0');
  });

  it('includes a rule only for items with an explicit placement', () => {
    const css = buildGridCss(DEFAULT_GRID_CONTAINER, [
      { gridColumn: 'span 2', gridRow: 'auto' },
      { gridColumn: 'auto', gridRow: 'auto' },
    ]);
    expect(css).toContain('.item-0 { grid-column: span 2; }');
    expect(css).not.toContain('.item-1');
  });
});

describe('buildGridHtml', () => {
  it('emits one numbered child div per item', () => {
    const html = buildGridHtml([{ gridColumn: 'auto', gridRow: 'auto' }, { gridColumn: 'auto', gridRow: 'auto' }]);
    expect(html).toContain('class="item item-0"');
    expect(html).toContain('>2<');
  });
});
