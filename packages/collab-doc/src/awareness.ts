import * as encoding from 'lib0/encoding';
import * as decoding from 'lib0/decoding';

/** Number of presence colour slots; the app maps a slot to a theme token, never a colour value. */
export const COLLAB_COLOR_SLOTS = 8;
export const COLLAB_NAME_MAX_LENGTH = 64;
export const COLLAB_DEVICE_ID_MAX_LENGTH = 64;
/** A y-protocols awareness update may carry this many clients before it is refused as malformed. */
const MAX_UPDATE_ENTRIES = 64;

/** A Y.RelativePosition in its JSON form. */
export type CollabRelativePositionJson = Record<string, unknown>;

export interface CollabAwarenessIdentity {
  readonly deviceId: string;
  readonly name: string;
  readonly colorSlot: number;
}

export interface CollabAwarenessState {
  readonly user: CollabAwarenessIdentity;
  readonly cursor: { readonly anchor: CollabRelativePositionJson; readonly head: CollabRelativePositionJson } | null;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;

const hasOnlyKeys = (value: Record<string, unknown>, keys: readonly string[]): boolean =>
  Object.keys(value).every(key => keys.includes(key));

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);

const isItemId = (value: unknown): boolean =>
  isRecord(value) && hasOnlyKeys(value, ['client', 'clock']) && isFiniteNumber(value['client']) && isFiniteNumber(value['clock']);

/** Y.RelativePosition JSON: any of `type`/`item` ids, a `tname`, and a numeric `assoc`; nothing else. */
function isRelativePositionJson(value: unknown): value is CollabRelativePositionJson {
  if (!isRecord(value) || !hasOnlyKeys(value, ['type', 'tname', 'item', 'assoc'])) return false;
  if (value['type'] !== undefined && value['type'] !== null && !isItemId(value['type'])) return false;
  if (value['item'] !== undefined && value['item'] !== null && !isItemId(value['item'])) return false;
  if (value['tname'] !== undefined && value['tname'] !== null && (typeof value['tname'] !== 'string' || value['tname'].length > 64)) return false;
  if (value['assoc'] !== undefined && !isFiniteNumber(value['assoc'])) return false;
  return true;
}

function isCursor(value: unknown): value is NonNullable<CollabAwarenessState['cursor']> {
  return isRecord(value) && hasOnlyKeys(value, ['anchor', 'head']) && isRelativePositionJson(value['anchor']) && isRelativePositionJson(value['head']);
}

export function isCollabAwarenessIdentity(value: unknown): value is CollabAwarenessIdentity {
  if (!isRecord(value) || !hasOnlyKeys(value, ['deviceId', 'name', 'colorSlot'])) return false;
  const { deviceId, name, colorSlot } = value;
  return typeof deviceId === 'string' && deviceId.length >= 1 && deviceId.length <= COLLAB_DEVICE_ID_MAX_LENGTH
    && typeof name === 'string' && name.length >= 1 && name.length <= COLLAB_NAME_MAX_LENGTH
    && typeof colorSlot === 'number' && Number.isInteger(colorSlot) && colorSlot >= 0 && colorSlot < COLLAB_COLOR_SLOTS;
}

/** Strict validator for an awareness state: exactly `{ user, cursor }` with no extra fields at any level. */
export function isCollabAwarenessState(value: unknown): value is CollabAwarenessState {
  if (!isRecord(value) || !hasOnlyKeys(value, ['user', 'cursor']) || !('user' in value) || !('cursor' in value)) return false;
  return isCollabAwarenessIdentity(value['user']) && (value['cursor'] === null || isCursor(value['cursor']));
}

interface RawAwarenessEntry { readonly clientId: number; readonly clock: number; readonly json: string }

/** Decodes the y-protocols awareness update wire format (`varUint n; n x [varUint client, varUint clock, varString json]`). */
function decodeAwarenessUpdate(update: Uint8Array): RawAwarenessEntry[] | null {
  try {
    const decoder = decoding.createDecoder(update);
    const count = decoding.readVarUint(decoder);
    if (count > MAX_UPDATE_ENTRIES || count > update.length) return null;
    const entries: RawAwarenessEntry[] = [];
    for (let i = 0; i < count; i += 1) {
      const clientId = decoding.readVarUint(decoder);
      const clock = decoding.readVarUint(decoder);
      const json = decoding.readVarString(decoder);
      entries.push({ clientId, clock, json });
    }
    return decoding.hasContent(decoder) ? null : entries;
  } catch {
    return null;
  }
}

/**
 * Hub-side sanitising of a client's awareness update. Every entry's `user` is overwritten with the authenticated
 * `identity` so a client can never present as another device, an entry whose state is not `{ user, cursor }` with a
 * valid cursor is dropped, and a removal entry (`null` state, how a client leaves) is kept. Returns the re-encoded
 * update, or null when the input is malformed, the identity is invalid, or nothing is left to forward.
 */
export function rewriteAwarenessUpdate(update: Uint8Array, identity: CollabAwarenessIdentity): Uint8Array | null {
  if (!isCollabAwarenessIdentity(identity)) return null;
  const entries = decodeAwarenessUpdate(update);
  if (!entries) return null;
  const kept: Array<{ clientId: number; clock: number; json: string }> = [];
  for (const entry of entries) {
    let state: unknown;
    try { state = JSON.parse(entry.json); } catch { continue; }
    if (state === null) { kept.push({ clientId: entry.clientId, clock: entry.clock, json: 'null' }); continue; }
    if (!isRecord(state) || !hasOnlyKeys(state, ['user', 'cursor'])) continue;
    const cursor = state['cursor'] ?? null;
    if (cursor !== null && !isCursor(cursor)) continue;
    const rewritten: CollabAwarenessState = { user: { deviceId: identity.deviceId, name: identity.name, colorSlot: identity.colorSlot }, cursor };
    kept.push({ clientId: entry.clientId, clock: entry.clock, json: JSON.stringify(rewritten) });
  }
  if (kept.length === 0) return null;
  const encoder = encoding.createEncoder();
  encoding.writeVarUint(encoder, kept.length);
  for (const entry of kept) {
    encoding.writeVarUint(encoder, entry.clientId);
    encoding.writeVarUint(encoder, entry.clock);
    encoding.writeVarString(encoder, entry.json);
  }
  return encoding.toUint8Array(encoder);
}
