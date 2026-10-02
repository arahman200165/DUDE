import { describe, expect, it } from 'vitest';
import {
  addAce, aceFlagsFromByte, aceFlagsToByte, aceTypeFromByte, canonicalOrder, canonicalSidToken, describeAce, describeInheritanceScope, describeRights,
  formatAce, formatIcaclsInheritance, formatRightsText, formatSddl, isCanonicalOrder, isProtected, makeAce, mapGenericRights, parseRightsText, parseSddl,
  removeAce, resolveSidToken, setOwner, setProtected, sidTokenName, SddlParseError,
} from "./sddl.js";

// Captured from a real Windows 11 machine with (Get-Acl <path>).Sddl.
const WINDOWS_DIR = 'O:S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464G:S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464D:PAI(A;OICIIO;GA;;;CO)(A;OICIIO;GA;;;SY)(A;;0x1301bf;;;SY)(A;OICIIO;GA;;;BA)(A;;0x1301bf;;;BA)(A;OICIIO;GXGR;;;BU)(A;;0x1200a9;;;BU)(A;CIIO;GA;;;S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464)(A;;FA;;;S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464)(A;;0x1200a9;;;AC)(A;OICIIO;GXGR;;;AC)(A;;0x1200a9;;;S-1-15-2-2)(A;OICIIO;GXGR;;;S-1-15-2-2)';
const USER_PROFILE = 'O:SYG:SYD:P(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;FA;;;S-1-5-21-2235310796-1245719842-89684361-1001)(A;;0x100020;;;S-1-15-3-65536-599108337-2355189375-1353122160-3480128286-3345335107-485756383-4087318168-230526575)';
const HKCU_SOFTWARE = 'O:SYG:SYD:P(A;OICI;KR;;;RC)(A;OICI;KA;;;SY)(A;OICI;KA;;;BA)(A;OICI;KA;;;S-1-5-21-2235310796-1245719842-89684361-1001)(A;;KR;;;AC)(A;;KR;;;S-1-15-3-1024-1065365936-1281604716-3511738428-1654721687-432734479-3232135806-4053264122-3456934681)';
const HKLM_MICROSOFT = 'O:BAG:SYD:(A;;KA;;;BA)(A;CIID;KR;;;BU)(A;CIID;KA;;;BA)(A;CIID;KA;;;SY)(A;CIIOID;KA;;;CO)(A;CIID;KR;;;AC)(A;CIID;KR;;;S-1-15-3-1024-1065365936-1281604716-3511738428-1654721687-432734479-3232135806-4053264122-3456934681)';
const WINDOWSAPPS = 'O:S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464G:S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464D:PAI(A;OICI;0x1200a9;;;RC)(A;OICI;FA;;;SY)(A;OICI;0x1200a9;;;LS)(A;OICI;0x1200a9;;;NS)(A;CI;0x1200a9;;;BA)(XA;;0x1200a9;;;BU;(Exists WIN://SYSAPPID))(A;OICI;FA;;;S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464)(A;OICI;0x1200a9;;;S-1-15-3-1024-3635283841-2530182609-996808640-1887759898-3848208603-3313616867-983405619-2501854204)';
const SYSVOL = 'O:S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464G:S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464D:(A;;LC;;;AU)(A;OICIIO;SDGXGWGR;;;AU)(A;OICI;FA;;;SY)(A;OICI;FA;;;BA)(A;OICI;0x1200a9;;;BU)(A;;0x1000a1;;;S-1-15-3-65536-1888954469-739942743-1668119174-2468466756-4239452838-1296943325-355587736-700089176)';

describe('sddl parse/format round trip', () => {
  for (const [name, sddl] of Object.entries({ WINDOWS_DIR, USER_PROFILE, HKCU_SOFTWARE, HKLM_MICROSOFT, WINDOWSAPPS, SYSVOL })) {
    it(`round-trips ${name}`, () => { expect(formatSddl(parseSddl(sddl))).toBe(sddl); });
  }

  it('parses sections, flags and ACE fields', () => {
    const sd = parseSddl(WINDOWS_DIR);
    expect(sd.owner).toMatch(/^S-1-5-80-/);
    expect(sd.dacl?.flags).toEqual(['P', 'AI']);
    expect(sd.dacl?.aces).toHaveLength(13);
    expect(sd.dacl?.aces[0]).toMatchObject({ type: 'A', flags: ['OI', 'CI', 'IO'], rightsText: 'GA', mask: 0x10000000, sid: 'CO' });
    expect(sd.dacl?.aces[2]).toMatchObject({ rightsText: '0x1301bf', mask: 0x1301bf });
    expect(sd.dacl?.aces[5].mask).toBe(0xa0000000);
  });

  it('parses SACLs, audit flags and a conditional ACE', () => {
    const text = 'O:BAG:SYD:AR(XA;;FX;;;BU;(@User.Title=="PM" && Member_of{SID(BA)}))S:AI(AU;SAFA;FA;;;WD)(ML;;NW;;;LW)';
    const sd = parseSddl(text);
    expect(sd.dacl?.flags).toEqual(['AR']);
    expect(sd.dacl?.aces[0].extra).toBe('(@User.Title=="PM" && Member_of{SID(BA)})');
    expect(sd.sacl?.aces[0]).toMatchObject({ type: 'AU', flags: ['SA', 'FA'], sid: 'WD' });
    expect(sd.sacl?.aces[1]).toMatchObject({ type: 'ML', mask: 1 });
    expect(formatSddl(sd)).toBe(text);
  });

  it('accepts NO_ACCESS_CONTROL, empty DACL, any section order, whitespace', () => {
    expect(parseSddl('D:NO_ACCESS_CONTROL').dacl?.flags).toEqual(['NO_ACCESS_CONTROL']);
    expect(parseSddl('D:').dacl).toEqual({ flags: [], aces: [] });
    expect(formatSddl(parseSddl(' D:(A;;FA;;;WD)  O:SY '))).toBe('O:SYD:(A;;FA;;;WD)');
  });

  it('parses object ACEs with GUIDs', () => {
    const text = 'D:(OA;CI;CR;ab721a53-1e2f-11d0-9819-00aa0040529b;;WD)';
    expect(parseSddl(text).dacl?.aces[0]).toMatchObject({ type: 'OA', objectGuid: 'ab721a53-1e2f-11d0-9819-00aa0040529b', mask: 0x100 });
    expect(formatSddl(parseSddl(text))).toBe(text);
  });

  it('regenerates the rights text when the mask is edited', () => {
    const ace = parseSddl('D:(A;;FA;;;WD)').dacl!.aces[0];
    expect(formatAce({ ...ace, mask: 0x1200a9 })).toBe('(A;;0x1200a9;;;WD)');
    expect(formatAce({ ...ace, mask: 0x120089 })).toBe('(A;;FR;;;WD)');
  });
});

describe('sddl malformed input', () => {
  const bad: [string, RegExp][] = [
    ['', /Empty/],
    ['X:BA', /Expected/],
    ['O:BAO:SY', /Duplicate/],
    ['O:ZZ', /alias/],
    ['D:(A;;FA;;;WD', /Unterminated/],
    ['D:(A;;FA;;WD)', /6 or 7/],
    ['D:(Q;;FA;;;WD)', /ACE type/],
    ['D:(A;XX;FA;;;WD)', /flag/],
    ['D:(A;OIOI;FA;;;WD)', /Duplicate ACE flag/],
    ['D:(A;;ZZ;;;WD)', /rights token/],
    ['D:(A;;0x1ffffffff;;;WD)', /32 bits/],
    ['D:(A;;FA;nothex;;WD)', /GUID/],
    ['D:(A;;FA;;;S-2-1)', /SID/],
    ['D:(A;;FA;;;S-1-5-99999999999)', /SID/],
    ['D:(A;;F;;;WD)', /Malformed rights/],
    ['D:(A;;FA;;;WD)junk', /Expected/],
  ];
  for (const [text, message] of bad) {
    it(`rejects ${JSON.stringify(text)}`, () => {
      expect(() => parseSddl(text)).toThrow(SddlParseError);
      expect(() => parseSddl(text)).toThrow(message);
    });
  }
  it('reports a position', () => { try { parseSddl('O:BAX:'); } catch (e) { expect((e as SddlParseError).position).toBe(4); } });
});

describe('sid tokens', () => {
  it('resolves aliases and names', () => {
    expect(resolveSidToken('BA')).toBe('S-1-5-32-544');
    expect(resolveSidToken('s-1-5-18')).toBe('S-1-5-18');
    expect(resolveSidToken('DA')).toBeNull();
    expect(canonicalSidToken('S-1-5-32-544')).toBe('BA');
    expect(canonicalSidToken('S-1-5-21-1-2-3-1001')).toBe('S-1-5-21-1-2-3-1001');
    expect(sidTokenName('CO')).toBe('CREATOR OWNER');
    expect(sidTokenName('S-1-5-11')).toBe('NT AUTHORITY\\Authenticated Users');
    expect(sidTokenName('S-1-5-21-1-2-3-1001')).toBeNull();
  });
});

describe('rights text', () => {
  it('parses tokens, hex and decimal', () => {
    expect(parseRightsText('FA')).toBe(0x1f01ff);
    expect(parseRightsText('FRFX')).toBe(0x120089 | 0x1200a0);
    expect(parseRightsText('SDGXGWGR')).toBe(0xe0010000);
    expect(parseRightsText('0x1200A9')).toBe(0x1200a9);
    expect(parseRightsText('1179817')).toBe(0x1200a9);
    expect(parseRightsText('KA')).toBe(0xf003f);
    expect(parseRightsText('')).toBe(0);
  });
  it('formats like Windows', () => {
    expect(formatRightsText(0x1f01ff)).toBe('FA');
    expect(formatRightsText(0xf003f)).toBe('KA');
    expect(formatRightsText(0x20019)).toBe('KR');
    expect(formatRightsText(0x1200a9)).toBe('0x1200a9');
    expect(formatRightsText(0x80000000)).toBe('GR');
  });
});

describe('describeRights', () => {
  it('matches icacls simple rights for files', () => {
    const cases: [number, string, string][] = [
      [0x1f01ff, 'Full control', 'F'], [0x1301bf, 'Modify', 'M'], [0x1200a9, 'Read & execute', 'RX'],
      [0x120089, 'Read', 'R'], [0x100116, 'Write', 'W'], [0x120116, 'Write', 'W,RC'],
    ];
    for (const [mask, summary, short] of cases) expect(describeRights(mask, 'file')).toMatchObject({ summary, short });
  });
  it('resolves generic rights', () => {
    expect(describeRights(0x10000000, 'directory')).toMatchObject({ summary: 'Full control', short: 'F', generic: ['GENERIC_ALL'] });
    expect(describeRights(0xa0000000, 'directory')).toMatchObject({ summary: 'Read & execute', short: 'GR,GE' });
    expect(mapGenericRights(0x80000000, 'registry')).toBe(0x20019);
  });
  it('lists special rights', () => {
    const d = describeRights(0x100020, 'file');
    expect(d.summary).toBe('Special permissions');
    expect(d.short).toBe('S,X');
    expect(d.names).toEqual(['Execute', 'Synchronize']);
    expect(describeRights(0x1200a9 | 0x40000, 'file')).toMatchObject({ summary: 'Read & execute + Special', short: 'RX,WDAC' });
    expect(describeRights(0, 'file').summary).toBe('No access');
  });
  it('uses directory wording for folders', () => {
    expect(describeRights(0x1, 'directory').names).toEqual(['List folder']);
    expect(describeRights(0x1, 'file').names).toEqual(['Read data']);
  });
  it('decodes registry key rights', () => {
    expect(describeRights(0xf003f, 'registry')).toMatchObject({ summary: 'Full control', short: 'KA' });
    expect(describeRights(0x20019, 'registry')).toMatchObject({ summary: 'Read', short: 'KR' });
    expect(describeRights(0x20006, 'registry')).toMatchObject({ summary: 'Write', short: 'KW' });
    expect(describeRights(0x20019, 'registry').names).toEqual(['Query value', 'Enumerate subkeys', 'Notify', 'Read permissions']);
    expect(describeRights(0x3f, 'registry').names).toEqual(['Query value', 'Set value', 'Create subkey', 'Enumerate subkeys', 'Notify', 'Create link']);
    expect(describeRights(0x3, 'registry')).toMatchObject({ summary: 'Special permissions' });
  });
});

describe('ACE flags and inheritance', () => {
  it('converts flag bytes', () => {
    expect(aceFlagsFromByte(0x1b)).toEqual(['OI', 'CI', 'IO', 'ID']);
    expect(aceFlagsToByte(['OI', 'CI', 'IO', 'ID'])).toBe(0x1b);
    expect(aceFlagsFromByte(0xc0)).toEqual(['SA', 'FA']);
    expect(aceTypeFromByte(1)).toBe('D');
    expect(aceTypeFromByte(200)).toBe('0xc8');
  });
  it('formats icacls notation', () => {
    expect(formatIcaclsInheritance(['OI', 'CI', 'IO', 'ID'])).toBe('(I)(OI)(CI)(IO)');
    expect(formatIcaclsInheritance(['NP', 'CI'])).toBe('(CI)(NP)');
    expect(formatIcaclsInheritance([])).toBe('');
  });
  it('describes scope', () => {
    expect(describeInheritanceScope([], 'directory')).toBe('This folder only');
    expect(describeInheritanceScope(['OI', 'CI'], 'directory')).toBe('This folder, subfolders and files');
    expect(describeInheritanceScope(['OI', 'CI', 'IO'], 'directory')).toBe('Subfolders and files only');
    expect(describeInheritanceScope(['CI'], 'directory')).toBe('This folder and subfolders');
    expect(describeInheritanceScope(['CI', 'IO'], 'directory')).toBe('Subfolders only');
    expect(describeInheritanceScope(['OI'], 'directory')).toBe('This folder and files');
    expect(describeInheritanceScope(['OI', 'IO'], 'directory')).toBe('Files only');
    expect(describeInheritanceScope(['OI', 'CI', 'NP'], 'directory')).toBe('This folder, subfolders and files (one level only)');
    expect(describeInheritanceScope(['OI'], 'file')).toBe('This file only');
    expect(describeInheritanceScope(['CI'], 'registry')).toBe('This key and subkeys');
    expect(describeInheritanceScope(['CI', 'IO'], 'registry')).toBe('Subkeys only');
    expect(describeInheritanceScope([], 'registry')).toBe('This key only');
  });
  it('describes an ACE', () => {
    const ace = parseSddl(HKLM_MICROSOFT).dacl!.aces[1];
    expect(describeAce(ace, 'registry')).toMatchObject({ typeName: 'Allow', inherited: true, icacls: '(I)(CI)', scope: 'This key and subkeys', rights: { summary: 'Read' } });
  });
});

describe('editing helpers', () => {
  const base = 'O:BAG:SYD:PAI(D;;FA;;;S-1-5-21-1-2-3-1001)(A;OICI;FA;;;SY)(A;OICIID;0x1200a9;;;BU)';

  it('adds an ACE in canonical position without mutating the input', () => {
    const sd = parseSddl(base);
    const before = formatSddl(sd);
    const withDeny = addAce(sd, makeAce({ type: 'D', mask: 0x2, sid: 'S-1-5-32-546', flags: ['OI'] }));
    expect(formatSddl(withDeny)).toBe('O:BAG:SYD:PAI(D;;FA;;;S-1-5-21-1-2-3-1001)(D;OI;0x2;;;BG)(A;OICI;FA;;;SY)(A;OICIID;0x1200a9;;;BU)');
    const withAllow = addAce(sd, makeAce({ mask: 0x1301bf, sid: 'S-1-5-11' }));
    expect(formatSddl(withAllow)).toBe('O:BAG:SYD:PAI(D;;FA;;;S-1-5-21-1-2-3-1001)(A;OICI;FA;;;SY)(A;;0x1301bf;;;AU)(A;OICIID;0x1200a9;;;BU)');
    expect(formatSddl(sd)).toBe(before);
    expect(isCanonicalOrder(withAllow.dacl!.aces)).toBe(true);
  });

  it('creates a DACL and SACL when missing', () => {
    expect(formatSddl(addAce({ owner: 'BA' }, makeAce({ mask: 0x1f01ff, sid: 'BA' })))).toBe('O:BAD:(A;;FA;;;BA)');
    expect(formatSddl(addAce({}, makeAce({ type: 'AU', flags: ['SA', 'FA'], mask: 0x1f01ff, sid: 'WD' }), 'sacl'))).toBe('S:(AU;SAFA;FA;;;WD)');
  });

  it('removes an ACE by index', () => {
    const sd = parseSddl(base);
    expect(formatSddl(removeAce(sd, 1))).toBe('O:BAG:SYD:PAI(D;;FA;;;S-1-5-21-1-2-3-1001)(A;OICIID;0x1200a9;;;BU)');
    expect(() => removeAce(sd, 3)).toThrow(RangeError);
    expect(() => removeAce(sd, -1)).toThrow(RangeError);
    expect(() => removeAce({}, 0, 'sacl')).toThrow(RangeError);
  });

  it('protects with convert: inherited ACEs become explicit', () => {
    const sd = setProtected(parseSddl(base), true, 'convert');
    expect(isProtected(sd)).toBe(true);
    expect(formatSddl(sd)).toBe('O:BAG:SYD:PAI(D;;FA;;;S-1-5-21-1-2-3-1001)(A;OICI;FA;;;SY)(A;OICI;0x1200a9;;;BU)');
  });

  it('protects with convert using caller-supplied inherited ACEs', () => {
    const explicit = 'D:(A;OICI;FA;;;SY)';
    const inherited = parseSddl('D:(A;OICIID;0x1200a9;;;BU)(A;OICIID;FA;;;BA)').dacl!.aces;
    expect(formatSddl(setProtected(parseSddl(explicit), true, 'convert', inherited))).toBe('D:P(A;OICI;FA;;;SY)(A;OICI;0x1200a9;;;BU)(A;OICI;FA;;;BA)');
  });

  it('protects with remove: inherited ACEs are dropped', () => {
    expect(formatSddl(setProtected(parseSddl(base), true, 'remove'))).toBe('O:BAG:SYD:PAI(D;;FA;;;S-1-5-21-1-2-3-1001)(A;OICI;FA;;;SY)');
  });

  it('unprotects by clearing P only', () => {
    expect(formatSddl(setProtected(parseSddl('D:P(A;;FA;;;SY)'), false))).toBe('D:(A;;FA;;;SY)');
    expect(formatSddl(setProtected(parseSddl('D:(A;;FA;;;SY)'), true, 'remove'))).toBe('D:P(A;;FA;;;SY)');
  });

  it('keeps explicit-deny-first canonical order', () => {
    const sd = parseSddl('D:(A;;FA;;;SY)(D;;FA;;;BG)(A;ID;FA;;;BA)(D;ID;FA;;;BU)');
    expect(isCanonicalOrder(sd.dacl!.aces)).toBe(false);
    expect(formatSddl({ dacl: { flags: [], aces: canonicalOrder(sd.dacl!.aces) } })).toBe('D:(D;;FA;;;BG)(A;;FA;;;SY)(A;ID;FA;;;BA)(D;ID;FA;;;BU)');
  });

  it('sets the owner and validates SIDs', () => {
    expect(formatSddl(setOwner(parseSddl('O:SYD:(A;;FA;;;SY)'), 'S-1-5-32-544'))).toBe('O:BAD:(A;;FA;;;SY)');
    expect(() => setOwner({}, 'nope')).toThrow(SddlParseError);
    expect(() => makeAce({ mask: 1, sid: 'nope' })).toThrow(SddlParseError);
    expect(() => makeAce({ type: 'Q', mask: 1, sid: 'BA' })).toThrow(SddlParseError);
  });
});
