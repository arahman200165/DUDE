import { describe, expect, it } from 'vitest';
import { formatJavaScriptStackTrace } from "./stack-trace-format-javascript.js";

const SAMPLE = [
  "TypeError: Cannot read properties of undefined (reading 'foo')",
  '    at Object.<anonymous> (/app/src/index.js:12:20)',
  '    at Module._compile (node:internal/modules/cjs/loader:1105:14)',
  '    at /app/node_modules/express/lib/router/layer.js:95:5',
].join('\n');

describe('formatJavaScriptStackTrace', () => {
  it('tags the error header and application frames', () => {
    const result = formatJavaScriptStackTrace(SAMPLE);
    expect(result.lines[0].kind).toBe('header');
    expect(result.lines[1].kind).toBe('frame-app');
  });

  it('tags node internal and node_modules frames as library frames', () => {
    const result = formatJavaScriptStackTrace(SAMPLE);
    expect(result.lines[2].kind).toBe('frame-library');
    expect(result.lines[3].kind).toBe('frame-library');
  });
});
