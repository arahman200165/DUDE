import { buildAddAce, buildInheritance, buildRemoveAce, inheritFlags, parseMask, rightsPresets } from "./acl-inspector-logic.js";

const OWNER = 'O:S-1-5-21-1-2-3-1001G:S-1-5-21-1-2-3-1001';
const SDDL = `${OWNER}D:AI(A;OICI;0x1200a9;;;BU)(A;OICIID;FA;;;SY)`;

describe('acl-inspector-logic', () => {
  it('adds a deny entry ahead of allow entries with inheritance flags', () => {
    const after = buildAddAce(SDDL, { sid: 'S-1-5-32-545', kind: 'deny', mask: 0x120116, scope: 'oici', inheritOnly: false, noPropagate: true });
    expect(after).toBe(`${OWNER}D:AI(D;OICINP;FW;;;BU)(A;OICI;0x1200a9;;;BU)(A;OICIID;FA;;;SY)`);
  });
  it('rejects unusable principals and masks', () => {
    expect(() => buildAddAce(SDDL, { sid: 'not a sid', kind: 'allow', mask: 1, scope: 'this', inheritOnly: false, noPropagate: false })).toThrow(/SID/);
    expect(() => buildAddAce(SDDL, { sid: 'BU', kind: 'allow', mask: 0, scope: 'this', inheritOnly: false, noPropagate: false })).toThrow(/rights/);
  });
  it('removes only explicit entries', () => {
    expect(buildRemoveAce(SDDL, 0)).toBe(`${OWNER}D:AI(A;OICIID;FA;;;SY)`);
    expect(() => buildRemoveAce(SDDL, 1)).toThrow(/Inherited/);
    expect(() => buildRemoveAce(SDDL, 5)).toThrow(/no longer exists/);
  });
  it('disables inheritance by converting or removing, and re-enables it', () => {
    expect(buildInheritance(SDDL, 'convert')).toBe(`${OWNER}D:PAI(A;OICI;0x1200a9;;;BU)(A;OICI;FA;;;SY)`);
    expect(buildInheritance(SDDL, 'remove')).toBe(`${OWNER}D:PAI(A;OICI;0x1200a9;;;BU)`);
    expect(buildInheritance(`${OWNER}D:PAI(A;OICI;FA;;;SY)`, 'enable')).toBe(`${OWNER}D:AI(A;OICI;FA;;;SY)`);
  });
  it('parses masks and presets', () => {
    expect(parseMask('0x1200a9')).toBe(0x1200a9);
    expect(parseMask('1179817')).toBe(1179817);
    expect(parseMask('0')).toBeNull();
    expect(parseMask('zz')).toBeNull();
    expect(rightsPresets(false).map((p) => p.id)).toEqual(['F', 'M', 'RX', 'R', 'W']);
    expect(inheritFlags('this', true, true)).toEqual([]);
    expect(inheritFlags('ci', true, true)).toEqual(['CI', 'NP', 'IO']);
  });
});
