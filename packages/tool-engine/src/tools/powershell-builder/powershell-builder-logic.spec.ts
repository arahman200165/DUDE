import { draftValue, savedScriptFor } from "./powershell-builder-logic.js";

describe('PowerShell Builder draft conversion', () => {
  it('converts typed drafts into builder values', () => {
    expect(draftValue('string[]', 'a\nb c\n')).toEqual(['a', 'b c']);
    expect(draftValue('number[]', '1, 2 3')).toEqual([1, 2, 3]);
    expect(draftValue('switch', 'true')).toBe(true);
    expect(draftValue('hashtable', 'a=1\nb=true\nc=x=y')).toEqual({ a: 1, b: true, c: 'x=y' });
    expect(() => draftValue('number', '')).toThrow(/number/i);
    expect(() => draftValue('hashtable', 'nokey')).toThrow(/key=value/);
  });

  it('restores saved scripts by digest without any execution hook', () => {
    expect(savedScriptFor({ abc: { script: 'Get-Date' } }, 'abc')).toBe('Get-Date');
    expect(savedScriptFor({}, 'abc')).toBeUndefined();
  });
});
