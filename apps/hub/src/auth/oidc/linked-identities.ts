import { transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { newId } from '../../util/ids.js';
import { OIDC_PROVIDER } from './constants.js';

/**
 * Linked external identities (32-SS1, Milestone 841, PD-145). An identity binds to the owner by the provider's stable `sub` ONLY: the
 * address is display text, refreshed on each sign-in and never used to find or match an owner. `(provider, sub)` is unique, so one
 * Google account belongs to one row. Several of the owner's accounts may be linked; the LAST one cannot be removed (the routes of
 * Milestone 842 add step-up in front, this repository owns the invariant so no caller can forget it).
 */

export interface LinkedIdentity {
  id: string;
  ownerId: string;
  provider: typeof OIDC_PROVIDER;
  sub: string;
  email: string | null;
  issuer: string;
  linkedAt: string;
  lastUsedAt: string | null;
}

export type LinkResult = { status: 'linked'; identity: LinkedIdentity } | { status: 'already-linked'; ownerId: string };
export type UnlinkResult = { status: 'unlinked' } | { status: 'last-identity' } | { status: 'not-found' };

interface Row { id: string; owner_id: string; provider: typeof OIDC_PROVIDER; sub: string; email: string | null; issuer: string; linked_at: string; last_used_at: string | null }

const COLUMNS = 'id, owner_id, provider, sub, email, issuer, linked_at, last_used_at';
const toIdentity = (row: Row): LinkedIdentity => ({
  id: row.id, ownerId: row.owner_id, provider: row.provider, sub: row.sub, email: row.email, issuer: row.issuer, linkedAt: row.linked_at, lastUsedAt: row.last_used_at,
});

export interface LinkedIdentities {
  list(ownerId: string): LinkedIdentity[];
  count(ownerId: string): number;
  /** The identity for a provider subject, or undefined. This is the only lookup sign-in uses. */
  findBySub(sub: string): LinkedIdentity | undefined;
  link(input: { ownerId: string; sub: string; email: string | undefined; issuer: string }): LinkResult;
  /** Records a successful sign-in and refreshes the display address. */
  touch(id: string, email: string | undefined): void;
  /** Removes one identity unless it is the owner's last. */
  unlink(ownerId: string, id: string): UnlinkResult;
}

export function createLinkedIdentities(db: Db, options: { now?: () => number; newId?: () => string } = {}): LinkedIdentities {
  const now = options.now ?? Date.now;
  const makeId = options.newId ?? (() => newId(now));
  const iso = (): string => new Date(now()).toISOString();
  const countFor = (ownerId: string): number => Number((db.prepare('SELECT COUNT(*) AS n FROM linked_identities WHERE owner_id = ?').get(ownerId) as { n: number | bigint }).n);

  return {
    list: (ownerId) => (db.prepare(`SELECT ${COLUMNS} FROM linked_identities WHERE owner_id = ? ORDER BY linked_at, id`).all(ownerId) as unknown as Row[]).map(toIdentity),
    count: countFor,
    findBySub(sub) {
      const row = db.prepare(`SELECT ${COLUMNS} FROM linked_identities WHERE provider = ? AND sub = ?`).get(OIDC_PROVIDER, sub) as Row | undefined;
      return row === undefined ? undefined : toIdentity(row);
    },
    link(input) {
      return transaction(db, (): LinkResult => {
        const existing = db.prepare('SELECT owner_id FROM linked_identities WHERE provider = ? AND sub = ?').get(OIDC_PROVIDER, input.sub) as { owner_id: string } | undefined;
        if (existing !== undefined) return { status: 'already-linked', ownerId: existing.owner_id };
        const id = makeId();
        db.prepare('INSERT INTO linked_identities(id, owner_id, provider, sub, email, issuer, linked_at, last_used_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL)')
          .run(id, input.ownerId, OIDC_PROVIDER, input.sub, input.email ?? null, input.issuer, iso());
        const row = db.prepare(`SELECT ${COLUMNS} FROM linked_identities WHERE id = ?`).get(id) as unknown as Row;
        return { status: 'linked', identity: toIdentity(row) };
      });
    },
    touch(id, email) {
      db.prepare('UPDATE linked_identities SET last_used_at = ?, email = COALESCE(?, email) WHERE id = ?').run(iso(), email ?? null, id);
    },
    unlink(ownerId, id) {
      return transaction(db, (): UnlinkResult => {
        const row = db.prepare('SELECT id FROM linked_identities WHERE id = ? AND owner_id = ?').get(id, ownerId);
        if (row === undefined) return { status: 'not-found' };
        if (countFor(ownerId) <= 1) return { status: 'last-identity' };
        db.prepare('DELETE FROM linked_identities WHERE id = ? AND owner_id = ?').run(id, ownerId);
        return { status: 'unlinked' };
      });
    },
  };
}
