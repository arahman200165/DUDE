import { testSelector } from './css-selector-tester-logic';

const SAMPLE = `
  <ul id="list">
    <li class="item first">One</li>
    <li class="item">Two</li>
    <li class="item" data-active="true">Three</li>
  </ul>
`;

describe('testSelector', () => {
  it('flags matching elements and reports the total match count', () => {
    const result = testSelector(SAMPLE, '.item');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.matchCount).toBe(3);
    expect(result.elements.filter((e) => e.matched)).toHaveLength(3);
  });

  it('matches by id', () => {
    const result = testSelector(SAMPLE, '#list');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.matchCount).toBe(1);
    expect(result.elements.find((e) => e.matched)?.tag).toBe('ul');
  });

  it('matches by attribute selector', () => {
    const result = testSelector(SAMPLE, '[data-active="true"]');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.matchCount).toBe(1);
  });

  it('reports zero matches for a selector that matches nothing, without error', () => {
    const result = testSelector(SAMPLE, '.nonexistent');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.matchCount).toBe(0);
  });

  it('lists every element in document order with correct depth', () => {
    const result = testSelector(SAMPLE, '.item');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.elements[0].tag).toBe('ul');
    expect(result.elements[0].depth).toBe(0);
    expect(result.elements[1].tag).toBe('li');
    expect(result.elements[1].depth).toBe(1);
  });

  it('rejects an empty selector', () => {
    expect(testSelector(SAMPLE, '')).toEqual({ ok: false, error: 'Enter a CSS selector.' });
  });

  it('rejects invalid selector syntax', () => {
    const result = testSelector(SAMPLE, ':::garbage:::');
    expect(result.ok).toBe(false);
  });
});
