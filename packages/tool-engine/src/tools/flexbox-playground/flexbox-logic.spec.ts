import { DEFAULT_CONTAINER, DEFAULT_ITEMS, FlexItemSettings, buildContainerCss, buildFlexboxHtml, buildItemCss } from "./flexbox-logic.js";

describe('buildContainerCss', () => {
  it('includes display: flex and every container property', () => {
    const css = buildContainerCss(DEFAULT_CONTAINER);
    expect(css).toContain('display: flex;');
    expect(css).toContain('flex-direction: row;');
    expect(css).toContain('gap: 8px;');
  });
});

describe('buildItemCss', () => {
  it('includes grow/shrink/basis', () => {
    const item: FlexItemSettings = { grow: 1, shrink: 0, basis: '200px', alignSelf: 'auto' };
    expect(buildItemCss(item)).toBe('flex-grow: 1; flex-shrink: 0; flex-basis: 200px;');
  });

  it('appends align-self only when overridden from auto', () => {
    const item: FlexItemSettings = { grow: 0, shrink: 1, basis: 'auto', alignSelf: 'center' };
    expect(buildItemCss(item)).toBe('flex-grow: 0; flex-shrink: 1; flex-basis: auto; align-self: center;');
  });
});

describe('buildFlexboxHtml', () => {
  it('emits one numbered child div per item', () => {
    const html = buildFlexboxHtml(DEFAULT_ITEMS);
    expect(html).toContain('class="item item-0"');
    expect(html).toContain('>1<');
    expect(html).toContain('class="item item-2"');
    expect(html).toContain('>3<');
  });
});
