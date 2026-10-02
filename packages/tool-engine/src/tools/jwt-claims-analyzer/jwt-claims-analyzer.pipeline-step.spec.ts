import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./jwt-claims-analyzer.pipeline-step.js";

function base64url(value: unknown): string {
  const base64 = btoa(unescape(encodeURIComponent(JSON.stringify(value))));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function makeJwt(header: unknown, payload: unknown): string {
  return `${base64url(header)}.${base64url(payload)}.signature`;
}

describe('jwt-claims-analyzer pipeline step', () => {
  it('flags "alg":"none" as an error finding', async () => {
    const token = makeJwt({ alg: 'none' }, { exp: Math.floor(Date.now() / 1000) + 3600 });
    const result = await pipelineStep.run({ type: 'text', value: token });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const findings = result.output.value as readonly { code: string; severity: string }[];
    expect(findings.some((f) => f.code === 'alg-none' && f.severity === 'error')).toBe(true);
  });

  it('flags a missing exp claim as a warning', async () => {
    const token = makeJwt({ alg: 'HS256' }, {});
    const result = await pipelineStep.run({ type: 'text', value: token });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    const findings = result.output.value as readonly { code: string }[];
    expect(findings.some((f) => f.code === 'missing-exp')).toBe(true);
  });

  it('fails on a malformed token', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not-a-jwt' });
    expect(result.ok).toBe(false);
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'JWT Claims Analyzer expects text input.', kind: 'invalid-input' } });
  });
});
