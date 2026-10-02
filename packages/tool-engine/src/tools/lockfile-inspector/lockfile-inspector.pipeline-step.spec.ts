import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./lockfile-inspector.pipeline-step.js";

describe('lockfile-inspector pipeline step', () => {
  it('parses an npm lockfile from text via content sniffing', async () => {
    const content = JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'node_modules/lodash': { version: '4.17.21' } } });
    const result = await pipelineStep.run({ type: 'text', value: content });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.output.type).toBe('table');
    const table = result.output.value as { columns: readonly string[]; rows: readonly (readonly unknown[])[] };
    expect(table.columns).toEqual(['name', 'version', 'dependencies', 'resolved']);
    expect(table.rows).toEqual([['lodash', '4.17.21', 0, '']]);
  });

  it('parses a file value using its declared name for filename-based sniffing', async () => {
    const content = JSON.stringify({ lockfileVersion: 3, packages: { '': {}, 'node_modules/lodash': { version: '4.17.21' } } });
    const result = await pipelineStep.run({ type: 'file', value: { name: 'package-lock.json', mimeType: 'application/json', base64: btoa(content) } });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect((result.output.value as { rows: unknown[] }).rows).toHaveLength(1);
  });

  it('fails on unrecognizable content', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'not a lockfile' });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Lockfile Inspector expects text or file input.', kind: 'invalid-input' } });
  });
});
