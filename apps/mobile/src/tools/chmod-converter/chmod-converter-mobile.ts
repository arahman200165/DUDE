import { octalToPermissions, permissionsToOctal, permissionsToSymbolic, symbolicToPermissions, type Permissions } from '@dude/tool-engine/tools/chmod-converter/chmod-convert';

export type ChmodScope = 'owner' | 'group' | 'other';
export type ChmodBit = 'read' | 'write' | 'execute';
export type ChmodSpecial = 'setuid' | 'setgid' | 'sticky';
export const CHMOD_SCOPES: readonly ChmodScope[] = ['owner', 'group', 'other'];
export const CHMOD_BITS: readonly { readonly bit: ChmodBit; readonly letter: 'r' | 'w' | 'x'; readonly label: string }[] = [
  { bit: 'read', letter: 'r', label: 'Read' }, { bit: 'write', letter: 'w', label: 'Write' }, { bit: 'execute', letter: 'x', label: 'Execute' },
];
export const CHMOD_SPECIALS: readonly ChmodSpecial[] = ['setuid', 'setgid', 'sticky'];

/** The two text fields can hold a half-typed value, so they are tracked beside the last valid permissions (as on web). */
export interface ChmodState {
  readonly permissions: Permissions;
  readonly octal: string;
  readonly symbolic: string;
  readonly octalError: string;
  readonly symbolicError: string;
}

/** Same default as the web tool (rwxr-xr-x, 755). */
export const DEFAULT_PERMISSIONS: Permissions = {
  special: { setuid: false, setgid: false, sticky: false },
  owner: { read: true, write: true, execute: true },
  group: { read: true, write: false, execute: true },
  other: { read: true, write: false, execute: true },
};

export function stateFor(permissions: Permissions): ChmodState {
  return { permissions, octal: permissionsToOctal(permissions), symbolic: permissionsToSymbolic(permissions), octalError: '', symbolicError: '' };
}
export const initialChmodState = (): ChmodState => stateFor(DEFAULT_PERMISSIONS);

export function applyOctal(state: ChmodState, text: string): ChmodState {
  const result = octalToPermissions(text);
  if (!result.ok) return { ...state, octal: text, octalError: result.error };
  return { permissions: result.permissions, octal: text, symbolic: permissionsToSymbolic(result.permissions), octalError: '', symbolicError: '' };
}
export function applySymbolic(state: ChmodState, text: string): ChmodState {
  const result = symbolicToPermissions(text);
  if (!result.ok) return { ...state, symbolic: text, symbolicError: result.error };
  return { permissions: result.permissions, octal: permissionsToOctal(result.permissions), symbolic: text, octalError: '', symbolicError: '' };
}
export function toggleBit(state: ChmodState, scope: ChmodScope, bit: ChmodBit): ChmodState {
  const current = state.permissions;
  return stateFor({ ...current, [scope]: { ...current[scope], [bit]: !current[scope][bit] } });
}
export function toggleSpecial(state: ChmodState, kind: ChmodSpecial): ChmodState {
  const current = state.permissions;
  return stateFor({ ...current, special: { ...current.special, [kind]: !current.special[kind] } });
}

/** Stored state comes from the in-memory input store; anything that is not a full state falls back to the default. */
export function readChmodState(raw: unknown): ChmodState {
  const value = raw as Partial<ChmodState> | null;
  const valid = value && typeof value === 'object' && typeof value.octal === 'string' && typeof value.symbolic === 'string'
    && typeof value.octalError === 'string' && typeof value.symbolicError === 'string' && value.permissions && typeof value.permissions === 'object';
  return valid ? value as ChmodState : initialChmodState();
}
