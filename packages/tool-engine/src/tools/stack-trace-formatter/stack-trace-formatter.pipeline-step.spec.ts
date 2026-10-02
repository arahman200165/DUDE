import { describe, expect, it } from 'vitest';
import { pipelineStep } from "./stack-trace-formatter.pipeline-step.js";

describe('stack-trace-formatter pipeline step', () => {
  it('auto-detects and passes through a Python traceback', async () => {
    const text = ['Traceback (most recent call last):', '  File "/app/main.py", line 10, in <module>', '    process()'].join('\n');
    const result = await pipelineStep.run({ type: 'text', value: text });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.output.value).toBe(text);
  });

  it('formats a JavaScript stack trace', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'at Object.<anonymous> (/app/index.js:1:1)' });
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error('expected ok');
    expect(result.output.type).toBe('text');
  });

  it('passes through unrecognized text untouched', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'nothing recognizable here' });
    expect(result).toEqual({ ok: true, output: { type: 'text', value: 'nothing recognizable here' } });
  });

  it('rejects non-text input', async () => {
    const result = await pipelineStep.run({ type: 'json', value: {} });
    expect(result).toEqual({ ok: false, error: { message: 'Stack Trace Formatter expects text input.', kind: 'invalid-input' } });
  });
});
