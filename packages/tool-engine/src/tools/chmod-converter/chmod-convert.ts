export interface PermissionTriad {
  readonly read: boolean;
  readonly write: boolean;
  readonly execute: boolean;
}

export interface SpecialBits {
  readonly setuid: boolean;
  readonly setgid: boolean;
  readonly sticky: boolean;
}

export interface Permissions {
  readonly special: SpecialBits;
  readonly owner: PermissionTriad;
  readonly group: PermissionTriad;
  readonly other: PermissionTriad;
}

export const NO_PERMISSIONS: Permissions = {
  special: { setuid: false, setgid: false, sticky: false },
  owner: { read: false, write: false, execute: false },
  group: { read: false, write: false, execute: false },
  other: { read: false, write: false, execute: false },
};

function triadToDigit(triad: PermissionTriad): number {
  return (triad.read ? 4 : 0) + (triad.write ? 2 : 0) + (triad.execute ? 1 : 0);
}

function digitToTriad(digit: number): PermissionTriad {
  return { read: (digit & 4) !== 0, write: (digit & 2) !== 0, execute: (digit & 1) !== 0 };
}

function specialToDigit(special: SpecialBits): number {
  return (special.setuid ? 4 : 0) + (special.setgid ? 2 : 0) + (special.sticky ? 1 : 0);
}

function digitToSpecial(digit: number): SpecialBits {
  return { setuid: (digit & 4) !== 0, setgid: (digit & 2) !== 0, sticky: (digit & 1) !== 0 };
}

export type ChmodResult = { readonly ok: true; readonly permissions: Permissions } | { readonly ok: false; readonly error: string };

/** Parses a 3- or 4-digit octal chmod string (e.g. "755" or "4755") into a Permissions value. */
export function octalToPermissions(input: string): ChmodResult {
  const trimmed = input.trim();
  if (!/^[0-7]{3,4}$/.test(trimmed)) {
    return { ok: false, error: 'Enter 3 or 4 octal digits (0–7), e.g. 755 or 4755.' };
  }

  const digits = trimmed.length === 4 ? trimmed : `0${trimmed}`;
  const [specialDigit, ownerDigit, groupDigit, otherDigit] = digits.split('').map(Number);

  return {
    ok: true,
    permissions: {
      special: digitToSpecial(specialDigit),
      owner: digitToTriad(ownerDigit),
      group: digitToTriad(groupDigit),
      other: digitToTriad(otherDigit),
    },
  };
}

/** Renders Permissions as octal — 4 digits when any special bit is set, otherwise the conventional 3. */
export function permissionsToOctal(permissions: Permissions): string {
  const specialDigit = specialToDigit(permissions.special);
  const digits = `${triadToDigit(permissions.owner)}${triadToDigit(permissions.group)}${triadToDigit(permissions.other)}`;
  return specialDigit === 0 ? digits : `${specialDigit}${digits}`;
}

function symbolicTriad(triad: PermissionTriad, specialChar: string | null, specialLower: string, specialUpper: string): string {
  const read = triad.read ? 'r' : '-';
  const write = triad.write ? 'w' : '-';
  if (specialChar === null) return `${read}${write}${triad.execute ? 'x' : '-'}`;
  const execute = triad.execute ? specialLower : specialUpper;
  return `${read}${write}${execute}`;
}

/** Renders Permissions as the classic 9-character symbolic string, e.g. "rwxr-xr--" (or with s/t for special bits). */
export function permissionsToSymbolic(permissions: Permissions): string {
  const owner = symbolicTriad(permissions.owner, permissions.special.setuid ? 's' : null, 's', 'S');
  const group = symbolicTriad(permissions.group, permissions.special.setgid ? 's' : null, 's', 'S');
  const other = symbolicTriad(permissions.other, permissions.special.sticky ? 's' : null, 't', 'T');
  return `${owner}${group}${other}`;
}

function parseTriad(chars: string): { triad: PermissionTriad; specialSet: boolean } {
  const read = chars[0] === 'r';
  const write = chars[1] === 'w';
  const execChar = chars[2];
  const execute = execChar === 'x' || execChar === 's' || execChar === 't';
  const specialSet = execChar === 's' || execChar === 'S' || execChar === 't' || execChar === 'T';
  return { triad: { read, write, execute }, specialSet };
}

/** Parses a 9-character (or 10-character with a leading file-type char) symbolic permission string. */
export function symbolicToPermissions(input: string): ChmodResult {
  const trimmed = input.trim();
  const body = trimmed.length === 10 ? trimmed.slice(1) : trimmed;

  if (body.length !== 9 || !/^[r-][w-][xsS-][r-][w-][xsS-][r-][w-][xtT-]$/.test(body)) {
    return { ok: false, error: 'Enter a 9-character symbolic permission string, e.g. rwxr-xr--.' };
  }

  const ownerParsed = parseTriad(body.slice(0, 3));
  const groupParsed = parseTriad(body.slice(3, 6));
  const otherParsed = parseTriad(body.slice(6, 9));

  return {
    ok: true,
    permissions: {
      special: { setuid: ownerParsed.specialSet, setgid: groupParsed.specialSet, sticky: otherParsed.specialSet },
      owner: ownerParsed.triad,
      group: groupParsed.triad,
      other: otherParsed.triad,
    },
  };
}
