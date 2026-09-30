import {
  FILE_ALL_ACCESS, FILE_MODIFY, FILE_READ, FILE_READ_EXECUTE, FILE_WRITE, KEY_ALL_ACCESS, KEY_READ, KEY_WRITE,
  addAce, formatSddl, isInherited, isSidToken, makeAce, parseSddl, removeAce, setProtected,
} from '../../../shared-logic/system/sddl';
import type { SysPlanRequest } from '../../../shared-logic/system/sys-mutation-types';
import type { AclTarget } from '../../../shared-logic/system/system-types';

/** Pure builders for ACL Inspector edits. Each returns the full after-SDDL; main re-validates and applies only the DACL. */

export const ACL_TOOL_ID = 'acl-inspector';

export interface RightsPreset { readonly id: string; readonly label: string; readonly mask: number }

const FILE_PRESETS: readonly RightsPreset[] = [
  { id: 'F', label: 'Full control (F)', mask: FILE_ALL_ACCESS },
  { id: 'M', label: 'Modify (M)', mask: FILE_MODIFY },
  { id: 'RX', label: 'Read and execute (RX)', mask: FILE_READ_EXECUTE },
  { id: 'R', label: 'Read (R)', mask: FILE_READ },
  { id: 'W', label: 'Write (W)', mask: FILE_WRITE },
];
const KEY_PRESETS: readonly RightsPreset[] = [
  { id: 'F', label: 'Full control', mask: KEY_ALL_ACCESS },
  { id: 'W', label: 'Write', mask: KEY_WRITE },
  { id: 'R', label: 'Read', mask: KEY_READ },
];

export const rightsPresets = (registry: boolean): readonly RightsPreset[] => (registry ? KEY_PRESETS : FILE_PRESETS);

/** Parses a custom access mask (`0x1200a9` or decimal). Returns null when it is not a non-zero 32-bit value. */
export function parseMask(text: string): number | null {
  const value = text.trim();
  if (!/^(?:0x[0-9a-f]{1,8}|\d{1,10})$/i.test(value)) return null;
  const mask = Number(value);
  return Number.isInteger(mask) && mask > 0 && mask <= 0xffffffff ? mask : null;
}

export type InheritScope = 'this' | 'oici' | 'ci' | 'oi';

export interface AddAceInput {
  readonly sid: string;
  readonly kind: 'allow' | 'deny';
  readonly mask: number;
  readonly scope: InheritScope;
  readonly inheritOnly: boolean;
  readonly noPropagate: boolean;
}

export function inheritFlags(scope: InheritScope, inheritOnly: boolean, noPropagate: boolean): string[] {
  const flags = scope === 'oici' ? ['OI', 'CI'] : scope === 'ci' ? ['CI'] : scope === 'oi' ? ['OI'] : [];
  if (flags.length && noPropagate) flags.push('NP');
  if (flags.length && inheritOnly) flags.push('IO');
  return flags;
}

export function buildAddAce(sddl: string, input: AddAceInput): string {
  if (!isSidToken(input.sid)) throw new Error('Enter a valid SID or a resolvable account name.');
  if (!Number.isInteger(input.mask) || input.mask <= 0) throw new Error('Choose access rights to grant or deny.');
  const ace = makeAce({ type: input.kind === 'deny' ? 'D' : 'A', sid: input.sid, mask: input.mask, flags: inheritFlags(input.scope, input.inheritOnly, input.noPropagate) });
  return formatSddl(addAce(parseSddl(sddl), ace));
}

/** Removes the explicit DACL entry at `index` (an index into the descriptor's DACL). Inherited entries cannot be removed here. */
export function buildRemoveAce(sddl: string, index: number): string {
  const sd = parseSddl(sddl);
  const ace = sd.dacl?.aces[index];
  if (!ace) throw new Error('That permission entry no longer exists. Refresh and try again.');
  if (isInherited(ace)) throw new Error('Inherited entries come from the parent; change them there or disable inheritance.');
  return formatSddl(removeAce(sd, index));
}

export type InheritanceAction = 'convert' | 'remove' | 'enable';

export function buildInheritance(sddl: string, action: InheritanceAction): string {
  const sd = parseSddl(sddl);
  return formatSddl(action === 'enable' ? setProtected(sd, false) : setProtected(sd, true, action));
}

export function aclRequest(target: AclTarget, title: string, beforeSddl: string, afterSddl: string): SysPlanRequest {
  return {
    tool: ACL_TOOL_ID, title: title.slice(0, 200),
    ops: [{ kind: 'acl.set-dacl', params: { target, beforeSddl, afterSddl } }],
  };
}
