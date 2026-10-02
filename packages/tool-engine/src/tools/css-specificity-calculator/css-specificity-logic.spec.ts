import { rankSelectors, scoreSelector, splitSelectorList } from "./css-specificity-logic.js";

describe('scoreSelector', () => {
  it('scores an id selector as (1,0,0)', () => {
    const result = scoreSelector('#header');
    expect(result).toEqual({ ok: true, score: { selector: '#header', a: 1, b: 0, c: 0, formatted: '(1,0,0)' } });
  });

  it('scores a mixed selector correctly', () => {
    const result = scoreSelector('#id .class[attr]:hover div::before');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.score.a).toBe(1);
    expect(result.score.b).toBe(3);
    expect(result.score.c).toBe(2);
  });

  it('scores the universal selector as (0,0,0)', () => {
    const result = scoreSelector('*');
    expect(result).toEqual({ ok: true, score: { selector: '*', a: 0, b: 0, c: 0, formatted: '(0,0,0)' } });
  });

  it('rejects an empty input', () => {
    expect(scoreSelector('')).toEqual({ ok: false, error: 'Enter a CSS selector.' });
  });

  it('rejects unparseable syntax with the library error message', () => {
    const result = scoreSelector('div[unclosed');
    expect(result.ok).toBe(false);
  });
});

describe('splitSelectorList', () => {
  it('splits on top-level commas and trims whitespace', () => {
    expect(splitSelectorList('div, .foo , #bar')).toEqual(['div', '.foo', '#bar']);
  });

  it('drops empty segments', () => {
    expect(splitSelectorList('div,, .foo')).toEqual(['div', '.foo']);
  });
});

describe('rankSelectors', () => {
  it('ranks a selector list from most to least specific', () => {
    const ranked = rankSelectors('div, #id, .class');
    const byRank = [...ranked].sort((x, y) => (x.rank ?? 99) - (y.rank ?? 99));
    expect(byRank.map((r) => (r.result.ok ? r.result.score.selector : null))).toEqual(['#id', '.class', 'div']);
  });

  it('leaves rank undefined for a selector that failed to parse', () => {
    const ranked = rankSelectors('div, [unclosed');
    const failed = ranked.find((r) => !r.result.ok);
    expect(failed?.rank).toBeUndefined();
  });
});
