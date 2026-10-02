import { flavorNotesFor } from "./regex-flavor-notes.js";

describe('flavorNotesFor', () => {
  it('returns no notes for an empty pattern', () => {
    expect(flavorNotesFor('', '', 'go')).toEqual([]);
  });

  it('flags lookahead as unsupported in Go RE2', () => {
    const notes = flavorNotesFor('foo(?=bar)', '', 'go');
    expect(notes.some((n) => n.id === 'go-no-lookaround')).toBe(true);
  });

  it('flags backreferences as unsupported in Go RE2', () => {
    const notes = flavorNotesFor('(a)\\1', '', 'go');
    expect(notes.some((n) => n.id === 'go-no-backreference')).toBe(true);
  });

  it('has no notes for a simple pattern with no exotic features', () => {
    expect(flavorNotesFor('abc', '', 'go')).toEqual([]);
    expect(flavorNotesFor('abc', '', 'python')).toEqual([]);
  });

  it('flags named-group syntax differences for Python', () => {
    const notes = flavorNotesFor('(?<year>\\d{4})', '', 'python');
    expect(notes.some((n) => n.id === 'python-named-group-syntax')).toBe(true);
  });

  it('flags bounded-lookbehind requirement for Java', () => {
    const notes = flavorNotesFor('(?<=foo)bar', '', 'java');
    expect(notes.some((n) => n.id === 'java-fixed-length-lookbehind')).toBe(true);
  });

  it('falls back to presence checks when the pattern fails to parse', () => {
    const notes = flavorNotesFor('(unclosed', '', 'go');
    expect(Array.isArray(notes)).toBe(true);
  });
});
