import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./http-digest-auth-helper.pipeline-step.js";

describe('http-digest-auth-helper pipeline step', () => {
  it('parses a WWW-Authenticate Digest challenge', async () => {
    const result = await pipelineStep.run({
      type: 'text',
      value: 'Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"',
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.output).toEqual({
        type: 'json',
        value: {
          realm: 'testrealm@host.com',
          nonce: 'dcd98b7102dd2f0e8b11d0f600bfb0c093',
          qop: 'auth,auth-int',
          opaque: '5ccc069c403ebaf9f0171e9517f40e41',
          algorithm: undefined,
        },
      });
    }
  });

  it('strips a leading "WWW-Authenticate:" prefix', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'WWW-Authenticate: Digest realm="r", nonce="n"' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((result.output as { value: { realm?: string } }).value.realm).toBe('r');
    }
  });

  it('fails on a header with no directives', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '   ' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'HTTP Digest Auth Helper expects text input.', kind: 'invalid-input' } });
  });
});
