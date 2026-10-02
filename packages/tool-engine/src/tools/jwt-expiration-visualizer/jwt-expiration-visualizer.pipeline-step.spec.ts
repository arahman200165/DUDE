import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./jwt-expiration-visualizer.pipeline-step.js";

function base64url(value: unknown): string {
  const base64 = btoa(unescape(encodeURIComponent(JSON.stringify(value))));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeJwt(header: unknown, payload: unknown): string {
  return `${base64url(header)}.${base64url(payload)}.signature`;
}

describe('jwt-expiration-visualizer pipeline step', () => {
  it('reports an active status with iso timestamps', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = makeJwt({ alg: 'HS256' }, { iat: nowSec - 1800, exp: nowSec + 1800 });
    const result = await pipelineStep.run({ type: 'text', value: token });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const timeline = result.output.value as { status: string; exp: string };
    expect(timeline.status).toBe('active');
    expect(new Date(timeline.exp).toString()).not.toBe('Invalid Date');
  });

  it('reports an expired status when exp is in the past', async () => {
    const nowSec = Math.floor(Date.now() / 1000);
    const token = makeJwt({ alg: 'HS256' }, { iat: nowSec - 7200, exp: nowSec - 60 });
    const result = await pipelineStep.run({ type: 'text', value: token });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect((result.output.value as { status: string }).status).toBe('expired');
  });

  it('reports no-expiry when there are no temporal claims', async () => {
    const token = makeJwt({ alg: 'HS256' }, {});
    const result = await pipelineStep.run({ type: 'text', value: token });
    expect(result).toEqual({ ok: true, output: { type: 'json', value: { status: 'no-expiry', iat: undefined, nbf: undefined, exp: undefined } } });
  });

  it('fails on a malformed token', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not-a-jwt' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'JWT Expiration Visualizer expects text input.', kind: 'invalid-input' } });
  });
});
