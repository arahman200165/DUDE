import { findCatastrophicBacktrackingRisks } from "./regex-catastrophic-heuristic.js";

function ids(pattern: string, flags = ''): readonly string[] {
  return findCatastrophicBacktrackingRisks(pattern, flags).map((f) => f.id);
}

describe('findCatastrophicBacktrackingRisks', () => {
  it('flags a nested unbounded quantifier: (a+)+', () => {
    expect(ids('(a+)+')).toContain('nested-quantifier');
  });

  it('flags a nested unbounded quantifier: (a*)*', () => {
    expect(ids('(a*)*')).toContain('nested-quantifier');
  });

  it('flags an unbounded quantifier around alternation: (a|ab)+', () => {
    expect(ids('(a|ab)+')).toContain('quantified-alternation');
  });

  it('flags an unbounded quantifier around alternation through a non-capturing group', () => {
    expect(ids('(?:foo|bar)+')).toContain('quantified-alternation');
  });

  it('does not flag a simple unbounded quantifier with no nesting', () => {
    expect(ids('a+')).toEqual([]);
  });

  it('does not flag a bounded repetition, even if nested', () => {
    expect(ids('(a+){1,5}')).toEqual([]);
  });

  it('does not flag a plain alternation with no surrounding quantifier', () => {
    expect(ids('cat|dog')).toEqual([]);
  });

  it('does not flag an optional (?) wrapping a quantified group — ? is bounded', () => {
    expect(ids('(a+)?')).toEqual([]);
  });

  it('returns no findings for an unparseable pattern rather than throwing', () => {
    expect(findCatastrophicBacktrackingRisks('(unclosed', '')).toEqual([]);
  });

  it('returns no findings for empty input', () => {
    expect(findCatastrophicBacktrackingRisks('', '')).toEqual([]);
  });
});
