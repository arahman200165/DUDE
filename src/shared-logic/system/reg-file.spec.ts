import { formatRegData, normalizeRegPath, parseRegFile, serializeRegFile, type RegFileKey } from './reg-file';

describe('parseRegFile', () => {
  const v5 = (body: string) => parseRegFile('Windows Registry Editor Version 5.00\r\n\r\n' + body);

  it('parses strings with escapes, default value and dword', () => {
    const { keys, format } = v5('[HKEY_CURRENT_USER\\Software\\T]\r\n@="def"\r\n"p"="C:\\\\a\\\\\\"q\\""\r\n"d"=dword:0000ff10\r\n');
    expect(format).toBe('REGEDIT5');
    expect(keys[0].values).toEqual([
      { name: '', type: 'REG_SZ', data: 'def' },
      { name: 'p', type: 'REG_SZ', data: 'C:\\a\\"q"' },
      { name: 'd', type: 'REG_DWORD', data: 0xff10 },
    ]);
  });

  it('decodes hex, hex(b), hex(2) and multi-line hex(7)', () => {
    const { keys } = v5([
      '[K]',
      '"b"=hex:de,ad,be,ef',
      '"q"=hex(b):ff,ff,ff,ff,ff,ff,ff,ff',
      '"e"=hex(2):25,00,50,00,25,00,00,00',
      '"m"=hex(7):61,00,00,00,62,00,63,00,00,00,\\',
      '  00,00',
      '"n"=hex(0):',
    ].join('\r\n'));
    const byName = Object.fromEntries(keys[0].values.map((x) => [x.name, x]));
    expect(byName['b']).toMatchObject({ type: 'REG_BINARY', data: 'deadbeef' });
    expect(byName['q']).toMatchObject({ type: 'REG_QWORD', data: '18446744073709551615' });
    expect(byName['e']).toMatchObject({ type: 'REG_EXPAND_SZ', data: '%P%' });
    expect(byName['m']).toMatchObject({ type: 'REG_MULTI_SZ', data: ['a', 'bc'] });
    expect(byName['n']).toMatchObject({ type: 'REG_NONE', data: '' });
  });

  it('reads REGEDIT4 (ANSI) hex strings, key deletion and value deletion', () => {
    const r = parseRegFile('REGEDIT4\n\n[-HKEY_CURRENT_USER\\Gone]\n\n[HKEY_CURRENT_USER\\Keep]\n"x"=-\n"e"=hex(2):25,50,25,00\n');
    expect(r.format).toBe('REGEDIT4');
    expect(r.keys[0]).toEqual({ path: 'HKEY_CURRENT_USER\\Gone', values: [], deleted: true });
    expect(r.keys[1].values[0]).toMatchObject({ name: 'x', deleted: true });
    expect(r.keys[1].values[1]).toMatchObject({ type: 'REG_EXPAND_SZ', data: '%P%' });
  });

  it('ignores BOM, comments and junk lines', () => {
    const r = parseRegFile('\uFEFFWindows Registry Editor Version 5.00\r\n; c\r\n[K]\r\nnonsense\r\n"a"="b"\r\n');
    expect(r.keys[0].values).toEqual([{ name: 'a', type: 'REG_SZ', data: 'b' }]);
  });
});

describe('serializeRegFile round trip', () => {
  const keys: RegFileKey[] = [
    {
      path: 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Round',
      values: [
        { name: '', type: 'REG_SZ', data: 'default' },
        { name: 'quote"back\\slash', type: 'REG_SZ', data: 'a"b\\c' },
        { name: 'dw', type: 'REG_DWORD', data: 4294967295 },
        { name: 'qw', type: 'REG_QWORD', data: '1234567890123' },
        { name: 'bin', type: 'REG_BINARY', data: '00ff10' },
        { name: 'emptybin', type: 'REG_BINARY', data: '' },
        { name: 'exp', type: 'REG_EXPAND_SZ', data: '%SystemRoot%\\system32 \u00fc \u2713' },
        { name: 'multi', type: 'REG_MULTI_SZ', data: ['one', 'two', 'three'] },
        { name: 'nomulti', type: 'REG_MULTI_SZ', data: [] },
        { name: 'none', type: 'REG_NONE', data: '0102' },
        { name: 'weird', type: 'REG_UNKNOWN', data: 'aa', rawType: 0x99 },
        { name: 'long', type: 'REG_BINARY', data: 'ab'.repeat(120) },
        { name: 'longexp', type: 'REG_EXPAND_SZ', data: 'x'.repeat(200) },
      ],
    },
    { path: 'HKEY_CURRENT_USER\\Gone', values: [], deleted: true },
    { path: 'HKEY_CURRENT_USER\\Empty', values: [] },
    { path: 'HKEY_CURRENT_USER\\Del', values: [{ name: 'x', type: 'REG_NONE', data: '', deleted: true }] },
  ];

  it('round-trips through parse', () => {
    const text = serializeRegFile(keys);
    expect(text.startsWith('Windows Registry Editor Version 5.00\r\n')).toBe(true);
    expect(parseRegFile(text).keys).toEqual(keys);
  });

  it('wraps long hex values at 80 columns', () => {
    const lines = serializeRegFile(keys).split('\r\n');
    expect(Math.max(...lines.map((l) => l.length))).toBeLessThanOrEqual(80);
  });

  it('round-trips randomised values', () => {
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let i = 0; i < 100; i++) {
      const str = Array.from({ length: Math.floor(rnd() * 20) }, () => String.fromCharCode(32 + Math.floor(rnd() * 200))).join('');
      const bin = Array.from({ length: Math.floor(rnd() * 40) }, () => Math.floor(rnd() * 256).toString(16).padStart(2, '0')).join('');
      const k: RegFileKey[] = [{ path: 'K', values: [
        { name: str || 'n', type: 'REG_SZ', data: str },
        { name: 'b', type: 'REG_BINARY', data: bin },
        { name: 'x', type: 'REG_EXPAND_SZ', data: str },
        { name: 'd', type: 'REG_DWORD', data: Math.floor(rnd() * 2 ** 32) },
      ] }];
      expect(parseRegFile(serializeRegFile(k)).keys).toEqual(k);
    }
  });
});

describe('helpers', () => {
  it('normalizes hive aliases', () => {
    expect(normalizeRegPath('HKLM\\SOFTWARE\\X\\')).toBe('HKEY_LOCAL_MACHINE\\SOFTWARE\\X');
    expect(normalizeRegPath('hkcu')).toBe('HKEY_CURRENT_USER');
    expect(normalizeRegPath('HKEY_USERS\\S-1')).toBe('HKEY_USERS\\S-1');
  });

  it('formats data by type', () => {
    expect(formatRegData('REG_DWORD', 255)).toBe('0x000000ff (255)');
    expect(formatRegData('REG_MULTI_SZ', ['a', 'b'])).toBe('a | b');
    expect(formatRegData('REG_BINARY', '0aff')).toBe('0a ff');
    expect(formatRegData('REG_SZ', '')).toBe('(empty)');
  });
});
