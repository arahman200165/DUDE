import { computeTextDelta } from "./text-delta.js";

describe('computeTextDelta', () => {
  it('returns a no-op delta for identical text', () => {
    expect(computeTextDelta('hello', 'hello')).toEqual({ index: 0, deleteCount: 0, insertText: '' });
  });

  it('detects an insertion at the end', () => {
    expect(computeTextDelta('hello', 'hello world')).toEqual({ index: 5, deleteCount: 0, insertText: ' world' });
  });

  it('detects an insertion at the start', () => {
    expect(computeTextDelta('world', 'hello world')).toEqual({ index: 0, deleteCount: 0, insertText: 'hello ' });
  });

  it('detects a deletion', () => {
    expect(computeTextDelta('hello world', 'hello')).toEqual({ index: 5, deleteCount: 6, insertText: '' });
  });

  it('detects a replacement in the middle', () => {
    expect(computeTextDelta('the cat sat', 'the dog sat')).toEqual({ index: 4, deleteCount: 3, insertText: 'dog' });
  });

  it('treats a full replacement with no shared prefix/suffix as delete-all + insert-all', () => {
    expect(computeTextDelta('abc', 'xyz')).toEqual({ index: 0, deleteCount: 3, insertText: 'xyz' });
  });

  it('handles emptying the text', () => {
    expect(computeTextDelta('hello', '')).toEqual({ index: 0, deleteCount: 5, insertText: '' });
  });

  it('handles starting from empty text', () => {
    expect(computeTextDelta('', 'hello')).toEqual({ index: 0, deleteCount: 0, insertText: 'hello' });
  });

  it('does not let prefix and suffix scans overlap on repetitive text', () => {
    // 'aaaa' -> 'aaa': naive prefix/suffix scans could overlap and report a
    // negative deleteCount if not clamped at prefixLength.
    expect(computeTextDelta('aaaa', 'aaa')).toEqual({ index: 3, deleteCount: 1, insertText: '' });
  });
});
