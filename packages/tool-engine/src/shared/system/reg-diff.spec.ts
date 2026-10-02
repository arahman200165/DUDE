import { diffRegistry, regKeysToMap, summarizeRegDiff, toRegDiffViewEntries } from "./reg-diff.js";
import { parseRegFile } from "./reg-file.js";

describe('diffRegistry', () => {
  const sz = (data: string) => ({ type: 'REG_SZ' as const, data });

  it('reports value add, remove and change', () => {
    const a = { 'HKEY_CURRENT_USER\\X': { keep: sz('1'), gone: sz('2'), chg: sz('old') } };
    const b = { 'HKEY_CURRENT_USER\\X': { keep: sz('1'), fresh: sz('3'), chg: sz('new') } };
    const d = diffRegistry(a, b);
    expect(d.map((e) => [e.valueName, e.op])).toEqual([['chg', 'change'], ['fresh', 'add'], ['gone', 'remove']]);
    expect(summarizeRegDiff(d)).toEqual({ added: 1, removed: 1, changed: 1 });
  });

  it('treats a type change as a change and compares case-insensitively', () => {
    const d = diffRegistry(
      { 'HKEY_CURRENT_USER\\X': { Name: sz('1') } },
      { 'hkey_current_user\\x': { name: { type: 'REG_EXPAND_SZ', data: '1' } } },
    );
    expect(d).toHaveLength(1);
    expect(d[0].op).toBe('change');
  });

  it('includes key add and remove', () => {
    const d = diffRegistry({ 'HKEY_USERS\\A': {} }, { 'HKEY_USERS\\B': { v: sz('x') } });
    expect(d.map((e) => [e.keyPath, e.valueName, e.op])).toEqual([
      ['HKEY_USERS\\A', undefined, 'remove'],
      ['HKEY_USERS\\B', undefined, 'add'],
      ['HKEY_USERS\\B', 'v', 'add'],
    ]);
  });

  it('is empty for identical trees and normalizes hive aliases', () => {
    const one = regKeysToMap(parseRegFile('Windows Registry Editor Version 5.00\r\n\r\n[HKEY_LOCAL_MACHINE\\S]\r\n@="d"\r\n"n"=dword:00000001\r\n').keys);
    const two = { 'HKLM\\S': { '': sz('d'), n: { type: 'REG_DWORD' as const, data: 1 } } };
    expect(diffRegistry(one, two)).toEqual([]);
  });

  it('maps onto diff-view entries', () => {
    const d = diffRegistry({ 'HKEY_USERS\\A': { '': sz('a') } }, { 'HKEY_USERS\\A': { '': sz('b') } });
    expect(toRegDiffViewEntries(d)).toEqual([{ path: 'HKEY_USERS\\A :: (Default)', op: 'replace', oldValue: 'REG_SZ: a', newValue: 'REG_SZ: b' }]);
  });
});
