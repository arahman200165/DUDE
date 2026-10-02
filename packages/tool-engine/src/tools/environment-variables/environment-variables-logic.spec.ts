import { buildExpansionMap, deleteRequest, filterEnvRows, setRequest, stringValues, toEnvRows, validateEnvName } from "./environment-variables-logic.js";

const val = (name: string, type: string, data: unknown) => ({ name, type, rawType: 1, byteLength: 0, data }) as never;

describe('environment-variables-logic', () => {
  it('keeps only string values and expands REG_EXPAND_SZ', () => {
    const user = stringValues([val('A', 'REG_SZ', 'x'), val('B', 'REG_EXPAND_SZ', '%A%\\b'), val('N', 'REG_DWORD', 1), val('', 'REG_SZ', 'd')]);
    expect(user.map((v) => v.name)).toEqual(['A', 'B']);
    const rows = toEnvRows(user, buildExpansionMap({ user }));
    expect(rows[1].expanded).toBe('x\\b');
    expect(rows[0].expanded).toBe('x');
  });
  it('filters by name or value', () => {
    const rows = toEnvRows([{ name: 'Path', value: 'C:\\bin', type: 'REG_SZ' }, { name: 'X', value: 'y', type: 'REG_SZ' }], new Map());
    expect(filterEnvRows(rows, 'bin').map((r) => r.name)).toEqual(['Path']);
  });
  it('validates names', () => {
    expect(validateEnvName('')).toBeTruthy();
    expect(validateEnvName('A=B')).toBeTruthy();
    expect(validateEnvName('OK')).toBeNull();
  });
  it('builds env.set and env.delete requests', () => {
    expect(setRequest('user', 'A', 'v', true).ops).toEqual([{ kind: 'env.set', params: { scope: 'user', name: 'A', value: 'v', expandable: true } }]);
    expect(deleteRequest('machine', 'A').ops).toEqual([{ kind: 'env.delete', params: { scope: 'machine', name: 'A' } }]);
  });
});
