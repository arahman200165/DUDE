import { afterEach, describe, expect, it } from 'vitest';
import { createLinkedIdentities } from './linked-identities.js';
import { OWNER_ID, T0, cleanOidcFixtures, openTestHubDb } from './oidc-fixture.js';

afterEach(cleanOidcFixtures);

const setup = () => {
  const db = openTestHubDb();
  const clock = { now: T0 };
  return { db, clock, identities: createLinkedIdentities(db, { now: () => clock.now }) };
};

const ISSUER = 'https://accounts.google.com';

describe('linked identities', () => {
  it('binds by sub: a second link of the same sub is refused and names the owner it already belongs to', () => {
    const { identities } = setup();
    const first = identities.link({ ownerId: OWNER_ID, sub: 'sub-1', email: 'a@example.com', issuer: ISSUER });
    expect(first).toMatchObject({ status: 'linked', identity: { ownerId: OWNER_ID, provider: 'google', sub: 'sub-1', email: 'a@example.com', issuer: ISSUER, lastUsedAt: null } });
    expect(identities.link({ ownerId: OWNER_ID, sub: 'sub-1', email: 'other@example.com', issuer: ISSUER })).toEqual({ status: 'already-linked', ownerId: OWNER_ID });
  });

  it('never finds an identity by address: the email is display text', () => {
    const { identities } = setup();
    identities.link({ ownerId: OWNER_ID, sub: 'sub-1', email: 'owner@example.com', issuer: ISSUER });
    expect(identities.findBySub('owner@example.com')).toBeUndefined();
    expect(identities.findBySub('sub-1')?.sub).toBe('sub-1');
    expect(identities.findBySub('sub-2')).toBeUndefined();
  });

  it('lets the owner link several accounts and lists them in link order', () => {
    const { clock, identities } = setup();
    identities.link({ ownerId: OWNER_ID, sub: 'sub-1', email: undefined, issuer: ISSUER });
    clock.now += 1000;
    identities.link({ ownerId: OWNER_ID, sub: 'sub-2', email: 'two@example.com', issuer: ISSUER });
    expect(identities.list(OWNER_ID).map((i) => [i.sub, i.email])).toEqual([['sub-1', null], ['sub-2', 'two@example.com']]);
    expect(identities.count(OWNER_ID)).toBe(2);
  });

  it('records a sign-in and refreshes the display address without ever blanking it', () => {
    const { clock, identities } = setup();
    const linked = identities.link({ ownerId: OWNER_ID, sub: 'sub-1', email: 'old@example.com', issuer: ISSUER });
    if (linked.status !== 'linked') throw new Error('expected linked');
    clock.now += 60_000;
    identities.touch(linked.identity.id, 'new@example.com');
    expect(identities.findBySub('sub-1')).toMatchObject({ email: 'new@example.com', lastUsedAt: new Date(T0 + 60_000).toISOString() });
    identities.touch(linked.identity.id, undefined);
    expect(identities.findBySub('sub-1')?.email).toBe('new@example.com');
  });

  it('never removes the last linked account, and removes another one', () => {
    const { identities } = setup();
    const a = identities.link({ ownerId: OWNER_ID, sub: 'sub-1', email: undefined, issuer: ISSUER });
    const b = identities.link({ ownerId: OWNER_ID, sub: 'sub-2', email: undefined, issuer: ISSUER });
    if (a.status !== 'linked' || b.status !== 'linked') throw new Error('expected linked');
    expect(identities.unlink(OWNER_ID, a.identity.id)).toEqual({ status: 'unlinked' });
    expect(identities.unlink(OWNER_ID, b.identity.id)).toEqual({ status: 'last-identity' });
    expect(identities.count(OWNER_ID)).toBe(1);
    expect(identities.unlink(OWNER_ID, 'nope')).toEqual({ status: 'not-found' });
    expect(identities.unlink('other-owner', b.identity.id)).toEqual({ status: 'not-found' });
  });

  it('a removed sub can be linked again (it is a fresh link, not a resurrection)', () => {
    const { identities } = setup();
    identities.link({ ownerId: OWNER_ID, sub: 'sub-1', email: undefined, issuer: ISSUER });
    const b = identities.link({ ownerId: OWNER_ID, sub: 'sub-2', email: undefined, issuer: ISSUER });
    const a = identities.findBySub('sub-1')!;
    expect(identities.unlink(OWNER_ID, a.id)).toEqual({ status: 'unlinked' });
    expect(identities.findBySub('sub-1')).toBeUndefined();
    expect(identities.link({ ownerId: OWNER_ID, sub: 'sub-1', email: undefined, issuer: ISSUER }).status).toBe('linked');
    expect(b.status).toBe('linked');
  });
});
