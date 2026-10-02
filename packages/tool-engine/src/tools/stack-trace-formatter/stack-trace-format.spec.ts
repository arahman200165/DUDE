import { describe, expect, it } from 'vitest';
import { formatStackTrace } from "./stack-trace-format.js";

describe('formatStackTrace', () => {
  it('auto-detects Python and formats accordingly', () => {
    const text = ['Traceback (most recent call last):', '  File "/app/main.py", line 10, in <module>', '    process()'].join('\n');
    const result = formatStackTrace(text, 'auto');
    expect(result.language).toBe('python');
    expect(result.trace.lines[1].kind).toBe('frame-app');
  });

  it('honors an explicit language override even if auto-detect would differ', () => {
    const result = formatStackTrace('at Object.<anonymous> (/app/index.js:1:1)', 'javascript');
    expect(result.language).toBe('javascript');
  });

  it('falls back to an untouched passthrough for unrecognized text', () => {
    const result = formatStackTrace('nothing recognizable here', 'auto');
    expect(result.language).toBe('unknown');
    expect(result.trace.lines).toEqual([{ text: 'nothing recognizable here', kind: 'other' }]);
  });
});
