import { mkdirSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { hubPaths } from '../config/data-dir.js';
import { startTestHub, tempDir } from '../server/test-helpers.js';
import { createFileProtector } from '../tls/ca-key-protector.js';
import { createLocalCa, issueLeafFromCa } from '../tls/local-ca.js';
import { subjectAltNames } from '../tls/x509.js';
import type { TestHub } from '../server/test-helpers.js';
import { fetchHello } from './common.js';

describe('fetchHello (pinned HTTPS)', () => {
  let hub: TestHub;
  beforeAll(async () => { hub = await startTestHub(); });
  afterAll(async () => { await hub.close(); });

  it('reads hello with the data directory certificate and returns null for a closed port', async () => {
    const hello = await fetchHello(hub.paths.root, hub.port);
    expect(hello).toMatchObject({ service: 'dude-hub', bootstrapped: false });
    expect(hello?.tls.spkiSha256).toBe(hub.tls.spkiSha256);
    expect(await fetchHello(hub.paths.root, 1)).toBeNull();
  });

  it('trusts the local CA root when the Hub certificate is CA-issued (a leaf alone does not chain to itself)', async () => {
    const root = tempDir('hub-hello-ca-');
    const { tlsDir } = hubPaths(root);
    mkdirSync(tlsDir, { recursive: true });
    const ca = createLocalCa({ tlsDir, hubInstanceId: 'hello-spec-hub', protector: createFileProtector() });
    const leaf = issueLeafFromCa({ caCertPem: ca.caCertPem, caKey: ca.caKey, hubInstanceId: 'hello-spec-hub', names: subjectAltNames() });
    writeFileSync(path.join(tlsDir, 'cert.pem'), leaf.certPem);
    const server = https.createServer({ key: leaf.keyPem, cert: leaf.certPem }, (_req, res) => {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ service: 'dude-hub', bootstrapped: false, tls: { spkiSha256: 'x' } }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const hello = await fetchHello(root, (server.address() as AddressInfo).port);
      expect(hello).toMatchObject({ service: 'dude-hub' });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
