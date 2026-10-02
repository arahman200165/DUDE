import { explainRegex } from "./regex-explain.js";

function joinedText(result: ReturnType<typeof explainRegex>): string {
  if (!result.ok) throw new Error(result.error);
  return result.lines.map((l) => l.text).join(' | ');
}

describe('explainRegex', () => {
  it('rejects an empty pattern', () => {
    expect(explainRegex('', '')).toEqual({ ok: false, error: 'Enter a regular expression.' });
  });

  it('rejects an unparsable pattern without affecting matching elsewhere', () => {
    const result = explainRegex('(unclosed', '');
    expect(result.ok).toBe(false);
  });

  it('describes a digit character class shorthand', () => {
    const text = joinedText(explainRegex('\\d', ''));
    expect(text).toContain('digit');
  });

  it('describes a quantified group', () => {
    const text = joinedText(explainRegex('(?:ab)+', ''));
    expect(text).toContain('one or more times');
  });

  it('describes a named capturing group', () => {
    const text = joinedText(explainRegex('(?<year>\\d{4})', ''));
    expect(text).toContain('named "year"');
    expect(text).toContain('exactly 4 times');
  });

  it('describes an unnamed capturing group by number', () => {
    const text = joinedText(explainRegex('(abc)', ''));
    expect(text).toContain('capturing group #1');
  });

  it('describes alternation', () => {
    const text = joinedText(explainRegex('cat|dog', ''));
    expect(text).toContain('either:');
    expect(text).toContain('or:');
  });

  it('describes a character class range', () => {
    const text = joinedText(explainRegex('[a-z]', ''));
    expect(text).toContain('through');
  });

  it('describes a negated character class', () => {
    const text = joinedText(explainRegex('[^abc]', ''));
    expect(text).toContain('any character except');
  });

  it('describes anchors', () => {
    expect(joinedText(explainRegex('^abc$', ''))).toContain('the start of the string/line');
  });

  it('describes a word boundary', () => {
    expect(joinedText(explainRegex('\\bcat\\b', ''))).toContain('word boundary');
  });

  it('describes a lookahead assertion', () => {
    const text = joinedText(explainRegex('foo(?=bar)', ''));
    expect(text).toContain('followed by');
  });

  it('describes a negative lookahead assertion', () => {
    const text = joinedText(explainRegex('foo(?!bar)', ''));
    expect(text).toContain('not followed by');
  });

  it('describes a lazy quantifier', () => {
    const text = joinedText(explainRegex('a+?', ''));
    expect(text).toContain('as few times as possible');
  });

  it('describes a backreference', () => {
    const text = joinedText(explainRegex('(a)\\1', ''));
    expect(text).toContain('group #1');
  });
});
