import { describe, expect, it } from 'vitest';
import { octalToPermissions, permissionsToOctal, permissionsToSymbolic, symbolicToPermissions } from "./chmod-convert.js";

describe('octalToPermissions / permissionsToOctal', () => {
  it('round-trips a plain 3-digit octal value', () => {
    const parsed = octalToPermissions('754');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(permissionsToOctal(parsed.permissions)).toBe('754');
      expect(permissionsToSymbolic(parsed.permissions)).toBe('rwxr-xr--');
    }
  });

  it('round-trips a 4-digit value with the setuid bit', () => {
    const parsed = octalToPermissions('4755');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.permissions.special.setuid).toBe(true);
      expect(permissionsToOctal(parsed.permissions)).toBe('4755');
      expect(permissionsToSymbolic(parsed.permissions)).toBe('rwsr-xr-x');
    }
  });

  it('renders setgid without owner-execute as a capital S', () => {
    const parsed = octalToPermissions('2644');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(permissionsToSymbolic(parsed.permissions)).toBe('rw-r-Sr--');
    }
  });

  it('renders the sticky bit on other', () => {
    const parsed = octalToPermissions('1777');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(permissionsToSymbolic(parsed.permissions)).toBe('rwxrwxrwt');
    }
  });

  it('rejects invalid octal input', () => {
    expect(octalToPermissions('999').ok).toBe(false);
    expect(octalToPermissions('75').ok).toBe(false);
    expect(octalToPermissions('abc').ok).toBe(false);
  });
});

describe('symbolicToPermissions', () => {
  it('parses a plain 9-character string', () => {
    const parsed = symbolicToPermissions('rwxr-xr--');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(permissionsToOctal(parsed.permissions)).toBe('754');
  });

  it('tolerates a leading file-type character', () => {
    const parsed = symbolicToPermissions('-rwxr-xr-x');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(permissionsToOctal(parsed.permissions)).toBe('755');
  });

  it('parses setuid with and without the owner-execute bit', () => {
    const withExec = symbolicToPermissions('rwsr-xr-x');
    expect(withExec.ok).toBe(true);
    if (withExec.ok) {
      expect(withExec.permissions.special.setuid).toBe(true);
      expect(withExec.permissions.owner.execute).toBe(true);
    }

    const withoutExec = symbolicToPermissions('rwSr--r--');
    expect(withoutExec.ok).toBe(true);
    if (withoutExec.ok) {
      expect(withoutExec.permissions.special.setuid).toBe(true);
      expect(withoutExec.permissions.owner.execute).toBe(false);
    }
  });

  it('rejects malformed symbolic input', () => {
    expect(symbolicToPermissions('rwx').ok).toBe(false);
    expect(symbolicToPermissions('zzzzzzzzz').ok).toBe(false);
  });
});
