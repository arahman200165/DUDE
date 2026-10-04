import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { setMeta } from '@dude/sqlite-store';
import { openHubDb } from '../db/open-hub-db.js';
import type { HubDb } from '../db/open-hub-db.js';
import { getAuthorityEpoch, getAuthorityState, setAuthority } from './authority.js';

describe('hub authority', () => {
  let dir: string;
  let hub: HubDb;
  beforeEach(() => {
    dir = mkdtempSync(path.join(os.tmpdir(), 'dude-hub-authority-'));
    const opened = openHubDb({ dbFile: path.join(dir, 'dude.db'), preMigrationDir: path.join(dir, 'pre') });
    if (opened.status !== 'ready') throw new Error('hub db not ready');
    hub = opened.hub;
  });
  afterEach(() => { hub.close(); rmSync(dir, { recursive: true, force: true }); });

  it('defaults to epoch 1 and active when nothing is stored', () => {
    expect(getAuthorityEpoch(hub.db)).toBe(1);
    expect(getAuthorityState(hub.db)).toBe('active');
  });

  it('round-trips an epoch and state', () => {
    setAuthority(hub.db, { epoch: 4, state: 'transferred' });
    expect(getAuthorityEpoch(hub.db)).toBe(4);
    expect(getAuthorityState(hub.db)).toBe('transferred');
    setAuthority(hub.db, { epoch: 5, state: 'active' });
    expect(getAuthorityEpoch(hub.db)).toBe(5);
    expect(getAuthorityState(hub.db)).toBe('active');
  });

  it.each(['0', '-2', '1.5', 'abc', '', ' 3', '3x', '99999999999999999999'])('falls back to epoch 1 for invalid stored value %j', (raw) => {
    setMeta(hub.db, 'authority_epoch', raw);
    expect(getAuthorityEpoch(hub.db)).toBe(1);
  });

  it('treats an unknown stored state as active', () => {
    setMeta(hub.db, 'authority_state', 'weird');
    expect(getAuthorityState(hub.db)).toBe('active');
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])('rejects epoch %s and writes nothing', (epoch) => {
    expect(() => setAuthority(hub.db, { epoch, state: 'active' })).toThrow(RangeError);
    expect(getAuthorityEpoch(hub.db)).toBe(1);
  });

  it('rejects an unknown state', () => {
    expect(() => setAuthority(hub.db, { epoch: 2, state: 'weird' as never })).toThrow(RangeError);
    expect(getAuthorityEpoch(hub.db)).toBe(1);
  });
});
