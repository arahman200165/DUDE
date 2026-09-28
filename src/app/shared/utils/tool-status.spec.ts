import { ToolDefinition } from '../models/tool-definition.model';
import { toolCapabilitySummary, toolStatusClass, toolStatusLabel } from './tool-status';

const noop = () => Promise.resolve();

const BASE: ToolDefinition = {
  id: 'json',
  title: 'JSON Formatter',
  description: 'Validate, format, and minify JSON.',
  category: 'data',
  keywords: [],
  route: '/tools/json',
  load: noop,
  io: { accepts: ['text'], produces: ['text'] },
};

describe('toolStatusLabel', () => {
  it('labels a tool with no declared status as "unstated", never coercing it to stable', () => {
    expect(toolStatusLabel(undefined)).toBe('unstated');
  });

  it('passes through a declared status verbatim', () => {
    expect(toolStatusLabel('verified')).toBe('verified');
  });
});

describe('toolStatusClass', () => {
  it('gives an unstated tool a distinct, muted class from a stable one', () => {
    expect(toolStatusClass(undefined)).not.toBe(toolStatusClass('stable'));
  });
});

describe('toolCapabilitySummary', () => {
  it('returns an em dash placeholder when no capabilities are declared', () => {
    expect(toolCapabilitySummary(BASE)).toBe('—');
  });

  it('joins platform and runtime capability labels', () => {
    const tool: ToolDefinition = {
      ...BASE,
      capabilities: [
        { kind: 'platform', id: 'native-fs', web: 'unavailable', note: 'Reads folders directly.' },
        { kind: 'runtime', runtime: 'pyodide' },
      ],
    };
    expect(toolCapabilitySummary(tool)).toBe('Native filesystem access, Pyodide (Python/WASM)');
  });
});
