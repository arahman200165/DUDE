import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./user-agent.pipeline-step.js";

const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36';

describe('user-agent pipeline step', () => {
  it('parses a User-Agent string into browser/engine/os details', async () => {
    const result = await pipelineStep.run({ type: 'text', value: DESKTOP_CHROME_UA });
    expect(result.ok).toBe(true);
    if (result.ok && result.output.type === 'json') {
      const parsed = result.output.value as { browser: { name?: string; version?: string } };
      expect(parsed.browser).toEqual({ name: 'Chrome', version: '119.0.0.0' });
    }
  });

  it('fails on empty input', async () => {
    const result = await pipelineStep.run({ type: 'text', value: '' });
    expect(result).toEqual({ ok: false, error: { message: 'Enter a User-Agent string.', kind: 'invalid-input' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'User-Agent Parser expects text input.', kind: 'invalid-input' } });
  });
});
