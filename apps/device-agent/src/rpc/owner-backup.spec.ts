import { randomBytes } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HubApiError } from '@dude/api-client';
import type { HubClient } from '@dude/api-client';
import type { BackupStatusResponse } from '@dude/contracts/hub';
import { cleanupTemp, openReady, tempDir } from '../testing/test-utils.js';
import type { HubRuntime } from '../hub/index.js';
import { createRpcServer } from './server.js';

afterEach(cleanupTemp);

const NOW = new Date('2026-03-01T12:00:00.000Z');
const DEVICE = '0190aaaa-0000-7000-8000-000000000001';

const STATUS: BackupStatusResponse = {
  authority: { epoch: 2, state: 'active' },
  lastBackup: { at: '2026-03-01T03:00:00.000Z', ok: true, file: 'dude-hub-backup.dudebak', size: 4096 },
  schedule: { configured: true, folder: 'D:\\Backups', intervalHours: 24, retention: 7, keyPresent: true },
  defaultFolder: 'C:\\ProgramData\\DUDE\\Hub\\backups',
  devicesNeedingRePair: 1,
};

/** An RPC server whose Hub runtime hands the owner callback a stub api client with one fixed bearer. */
function server(api: Partial<Record<keyof HubClient, unknown>>) {
  const withOwner = vi.fn(async (fn: (client: HubClient, token: string) => Promise<unknown>) => fn(api as unknown as HubClient, 'owner-token'));
  const hub = { manager: { owner: { withOwner } } } as unknown as HubRuntime;
  const rpc = createRpcServer(openReady(tempDir()), { now: () => NOW, randomBytes: (n) => new Uint8Array(randomBytes(n)), hub });
  const call = (method: string, params: unknown) => rpc.handle({ id: 1, method, params: params as never } as never);
  return { call, withOwner };
}

describe('hub.owner.backupStatus', () => {
  it('reads the Hub backup state with the owner bearer', async () => {
    const backupStatus = vi.fn(async () => STATUS);
    const { call, withOwner } = server({ backupStatus });
    expect(await call('hub.owner.backupStatus', {})).toMatchObject({ ok: true, result: STATUS });
    expect(withOwner).toHaveBeenCalledOnce();
    expect(backupStatus).toHaveBeenCalledExactlyOnceWith('owner-token');
  });

  it('answers a transferred Hub with the distinct hub-transferred code, not hub-hub-transferred', async () => {
    const { call } = server({ backupStatus: vi.fn(async () => { throw new HubApiError(503, 'hub-transferred', 'This Hub was transferred to another machine.'); }) });
    expect(await call('hub.owner.backupStatus', {})).toMatchObject({ ok: false, error: { code: 'hub-transferred', message: 'This Hub was transferred to another machine.' } });
  });

  it('keeps the hub- prefix for every other Hub error', async () => {
    const { call } = server({ backupStatus: vi.fn(async () => { throw new HubApiError(503, 'internal', 'boom'); }) });
    expect(await call('hub.owner.backupStatus', {})).toMatchObject({ ok: false, error: { code: 'hub-internal' } });
  });
});

describe('hub.owner.createPairingCode', () => {
  const code = { pairingCode: 'ABCD-EFGH', pairingString: 'dude-pair:v1:x', expiresAt: '2026-03-01T12:10:00.000Z', hubUrl: 'https://hub.local', spkiSha256: 'A'.repeat(43), reattachDeviceId: DEVICE };

  it('sends no body fields without a host or a re-attach device', async () => {
    const createPairingCode = vi.fn(async () => code);
    const { call } = server({ createPairingCode });
    expect(await call('hub.owner.createPairingCode', {})).toMatchObject({ ok: true });
    expect(createPairingCode).toHaveBeenCalledExactlyOnceWith('owner-token', {});
  });

  it('forwards the host and the re-attach device id', async () => {
    const createPairingCode = vi.fn(async () => code);
    const { call } = server({ createPairingCode });
    await call('hub.owner.createPairingCode', { host: 'hub.local' });
    await call('hub.owner.createPairingCode', { reattachDeviceId: DEVICE });
    await call('hub.owner.createPairingCode', { host: 'hub.local', reattachDeviceId: DEVICE });
    expect(createPairingCode.mock.calls).toEqual([
      ['owner-token', { host: 'hub.local' }],
      ['owner-token', { reattachDeviceId: DEVICE }],
      ['owner-token', { host: 'hub.local', reattachDeviceId: DEVICE }],
    ]);
  });

  it('rejects a non-string re-attach device before the Hub is called, and maps a Hub refusal to its code', async () => {
    const createPairingCode = vi.fn(async () => { throw new HubApiError(409, 'conflict', 'That device is not waiting to be paired again.'); });
    const { call } = server({ createPairingCode });
    expect(await call('hub.owner.createPairingCode', { reattachDeviceId: 5 })).toMatchObject({ ok: false, error: { code: 'invalid-params' } });
    expect(createPairingCode).not.toHaveBeenCalled();
    expect(await call('hub.owner.createPairingCode', { reattachDeviceId: DEVICE })).toMatchObject({ ok: false, error: { code: 'hub-conflict' } });
  });
});
