import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestHub } from '../server/test-helpers.js';
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
});
