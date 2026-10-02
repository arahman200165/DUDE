import { buildDomTree } from './dom-tree-logic';

describe('buildDomTree', () => {
  it('builds a tree node per root element', () => {
    const result = buildDomTree('<div><p>Hello</p></div>');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0].label).toBe('div');
  });

  it('includes attributes in the element valueLabel', () => {
    const result = buildDomTree('<div id="app" class="root"></div>');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodes[0].valueLabel).toBe(' id="app" class="root"');
  });

  it('nests child elements', () => {
    const result = buildDomTree('<ul><li>a</li><li>b</li></ul>');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodes[0].children).toHaveLength(2);
    expect(result.nodes[0].children?.[0].label).toBe('li');
  });

  it('includes non-whitespace text nodes as #text leaves', () => {
    const result = buildDomTree('<p>Hello</p>');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const textChild = result.nodes[0].children?.[0];
    expect(textChild?.label).toBe('#text');
    expect(textChild?.valueLabel).toBe('Hello');
  });

  it('drops whitespace-only text nodes', () => {
    const result = buildDomTree('<ul>\n  <li>a</li>\n</ul>');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodes[0].children).toHaveLength(1);
  });

  it('includes comment nodes', () => {
    const result = buildDomTree('<div><!-- note --></div>');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodes[0].children?.[0].label).toBe('#comment');
  });

  it('supports multiple root elements', () => {
    const result = buildDomTree('<div>a</div><div>b</div>');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.nodes).toHaveLength(2);
  });

  it('rejects empty input', () => {
    expect(buildDomTree('')).toEqual({ ok: false, error: 'Enter some HTML to view.' });
  });
});
