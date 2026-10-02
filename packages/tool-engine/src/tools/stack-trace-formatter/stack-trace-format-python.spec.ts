import { describe, expect, it } from 'vitest';
import { formatPythonStackTrace } from "./stack-trace-format-python.js";

const SAMPLE = [
  'Traceback (most recent call last):',
  '  File "/app/main.py", line 10, in <module>',
  '    process()',
  '  File "/app/main.py", line 6, in process',
  '    return 1 / 0',
  'ZeroDivisionError: division by zero',
].join('\n');

describe('formatPythonStackTrace', () => {
  it('tags the header, frame lines, their source snippets, and the final exception line', () => {
    const result = formatPythonStackTrace(SAMPLE);
    expect(result.lines[0].kind).toBe('header');
    expect(result.lines[1].kind).toBe('frame-app');
    expect(result.lines[2].kind).toBe('frame-app'); // snippet inherits its File line's kind
    expect(result.lines[5].kind).toBe('header');
  });

  it('tags site-packages frames as library frames', () => {
    const result = formatPythonStackTrace(
      ['Traceback (most recent call last):', '  File "/app/.venv/lib/site-packages/requests/api.py", line 5, in get', '    return request(...)'].join('\n'),
    );
    expect(result.lines[1].kind).toBe('frame-library');
    expect(result.lines[2].kind).toBe('frame-library');
  });
});
