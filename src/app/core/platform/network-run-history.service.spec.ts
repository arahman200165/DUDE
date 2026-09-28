import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { NetworkRunHistoryService } from './network-run-history.service';
import type { NetworkRun } from './network-diagnostics.service';

let history: NetworkRunHistoryService;
beforeEach(async () => { history = new NetworkRunHistoryService(); await history.clear(); });

describe('selected network history', () => {
  it('scrubs request secrets and downloaded HTTP body while keeping diagnostic metadata', async () => {
    const run: NetworkRun = {
      id: crypto.randomUUID(), createdAt: new Date().toISOString(),
      request: { kind: 'connectivity-tester', target: 'https://example.test', method: 'POST', headers: { Authorization: 'Bearer private' }, body: 'secret payload' },
      result: { status: 200, bodyBytes: 7, headers: { 'set-cookie': 'session=private' }, bodyBase64: 'cHJpdmF0ZQ==' },
    };
    await history.save(run);
    const stored = history.saved()[0];
    expect(stored.request.headers).toBeUndefined();
    expect(stored.request.body).toBeUndefined();
    expect(stored.result).toEqual({ status: 200, bodyBytes: 7, headers: {} });
    expect(run.request.headers).toEqual({ Authorization: 'Bearer private' });
  });

  it('never stores a client identity, pasted mail headers, or packet captures (Phase 28)', async () => {
    await history.save({
      id: crypto.randomUUID(), createdAt: new Date().toISOString(),
      request: { kind: 'tls-inspector', target: 'example.test', clientIdentity: { pfxBase64: 'AAAA', passphrase: 'pw' }, dkimHeaders: 'DKIM-Signature: d=x' },
      result: { protocol: 'TLSv1.3', pcapngBase64: 'AAAA' },
    });
    const stored = history.saved()[0];
    expect(stored.request.clientIdentity).toBeUndefined();
    expect(stored.request.dkimHeaders).toBeUndefined();
    expect(stored.result).toEqual({ protocol: 'TLSv1.3' });
  });

  it('expires old snapshots and restores saved values without a network job', async () => {
    await history.save({ id: 'old', createdAt: new Date(Date.now() - 31 * 86400000).toISOString(), request: { kind: 'ping', target: '127.0.0.1' }, result: { sent: 1 } });
    expect(history.saved()).toHaveLength(0);
    await history.save({ id: 'new', createdAt: new Date().toISOString(), request: { kind: 'ping', target: '127.0.0.1' }, result: { sent: 2 } });
    const second = new NetworkRunHistoryService();
    await second.refresh();
    expect(second.saved()).toEqual(history.saved());
  });

  it('keeps at most 100 selected snapshots', async () => {
    const timestamp = new Date().toISOString();
    for (let index = 0; index < 101; index++) {
      await history.save({ id: `run-${index}`, createdAt: timestamp, request: { kind: 'ping', target: '127.0.0.1' }, result: { sent: index } });
    }
    expect(history.saved()).toHaveLength(100);
  });
});
