import { decodeRegBytes, encodeUtf16leWithBom, parseRegistryPath, parseValueText, powerShellCommand, regExeCommand, subtreeOf } from "./registry-editor-logic.js";

describe('registry-editor logic', () => {
  it('parses the path forms', () => {
    const expected = { hive: 'HKLM', path: 'SOFTWARE\\Microsoft' };
    expect(parseRegistryPath('HKLM\\SOFTWARE\\Microsoft')).toEqual(expected);
    expect(parseRegistryPath('Computer\\HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\')).toEqual(expected);
    expect(parseRegistryPath('HKLM:\\SOFTWARE\\Microsoft')).toEqual(expected);
    expect(parseRegistryPath('Registry::HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft')).toEqual(expected);
    expect(parseRegistryPath('hkcu')).toEqual({ hive: 'HKCU', path: '' });
    expect(parseRegistryPath('HKXX\\a')).toBeNull();
  });

  it('builds copy commands', () => {
    expect(regExeCommand({ hive: 'HKLM', path: 'SOFTWARE\\X' }, '32')).toBe('reg query "HKLM\\SOFTWARE\\X" /s /reg:32');
    expect(powerShellCommand({ hive: 'HKCU', path: 'Software\\O\'Neil' })).toBe("Get-ItemProperty -Path 'HKCU:\\Software\\O''Neil'");
    expect(powerShellCommand({ hive: 'HKU', path: '' })).toBe("Get-ItemProperty -Path 'Registry::HKEY_USERS'");
  });

  it('parses value text by type', () => {
    expect(parseValueText('REG_DWORD', '0x10')).toEqual({ ok: true, data: 16 });
    expect(parseValueText('REG_DWORD', '4294967296').ok).toBe(false);
    expect(parseValueText('REG_QWORD', '18446744073709551615')).toEqual({ ok: true, data: '18446744073709551615' });
    expect(parseValueText('REG_BINARY', '0A FF')).toEqual({ ok: true, data: '0aff' });
    expect(parseValueText('REG_BINARY', '0A F').ok).toBe(false);
    expect(parseValueText('REG_MULTI_SZ', 'a\n\nb\n')).toEqual({ ok: true, data: ['a', 'b'] });
  });

  it('round-trips UTF-16 bytes and scopes a subtree', () => {
    expect(decodeRegBytes(encodeUtf16leWithBom('Windows Registry Editor ✓'))).toBe('Windows Registry Editor ✓');
    expect(decodeRegBytes(new TextEncoder().encode('REGEDIT4'))).toBe('REGEDIT4');
    const tree = { 'HKEY_CURRENT_USER\\A': {}, 'HKEY_CURRENT_USER\\A\\B': {}, 'HKEY_CURRENT_USER\\AB': {} };
    expect(Object.keys(subtreeOf(tree, { hive: 'HKCU', path: 'A' }))).toEqual(['HKEY_CURRENT_USER\\A', 'HKEY_CURRENT_USER\\A\\B']);
  });
});
