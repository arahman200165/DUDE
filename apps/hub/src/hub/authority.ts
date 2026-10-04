import { getMeta, setMeta } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';

export type AuthorityState = 'active' | 'transferred';

const EPOCH_KEY = 'authority_epoch';
const STATE_KEY = 'authority_state';

/** The Hub's authority epoch: a positive integer, 1 when never set or when the stored value is not a valid epoch. */
export function getAuthorityEpoch(db: Db): number {
  const raw = getMeta(db, EPOCH_KEY);
  if (raw === undefined || !/^[1-9][0-9]*$/.test(raw)) return 1;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) ? parsed : 1;
}

/** `active` unless the Hub's authority was transferred away. */
export function getAuthorityState(db: Db): AuthorityState {
  return getMeta(db, STATE_KEY) === 'transferred' ? 'transferred' : 'active';
}

export function setAuthority(db: Db, authority: { epoch: number; state: AuthorityState }): void {
  if (!Number.isSafeInteger(authority.epoch) || authority.epoch < 1) throw new RangeError('The authority epoch must be a positive integer.');
  if (authority.state !== 'active' && authority.state !== 'transferred') throw new RangeError('The authority state must be active or transferred.');
  setMeta(db, EPOCH_KEY, String(authority.epoch));
  setMeta(db, STATE_KEY, authority.state);
}
