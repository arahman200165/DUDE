import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FEATURE_OPS } from './feature';
import { WINDOWS_FEATURE_SCRIPTS } from '../windows-features';

const runFixedScript = vi.fn();
vi.mock('../sys-pwsh', () => ({ runFixedScript: (...args: unknown[]) => runFixedScript(...args) }));

const params = { name: 'Microsoft-Hyper-V-All' };
const ctx = { elevated: true, helper: vi.fn(), signal: new AbortController().signal, backup: vi.fn() };
const enabledRow = { name: params.name, displayName: 'Hyper-V', state: 'enabled', restartNeeded: false } as const;
const disabledRow = { ...enabledRow, state: 'disabled' } as const;
const enable = FEATURE_OPS[0];
const disable = FEATURE_OPS[1];

describe('Windows feature operations', () => {
  beforeEach(() => runFixedScript.mockReset());

  it('validates names and rejects extra operation fields', () => {
    expect(enable.validate(params)).toEqual({ ...params, enabled: true });
    expect(() => enable.validate({ ...params, enabled: false })).toThrow();
    expect(() => enable.validate({ ...params, extra: 1 })).toThrow();
  });

  it('marks mutations elevated and previews restart impact', async () => {
    runFixedScript.mockResolvedValue([disabledRow]);
    const preview = await enable.preview(enable.validate(params), ctx);
    expect(preview).toMatchObject({ requiresElevation: true, noUndo: false, before: 'disabled', after: 'enabled' });
    expect(preview.warnings?.some((warning) => warning.includes('restart'))).toBe(true);
  });

  it('rechecks state before mutation and records inverse operation', async () => {
    runFixedScript.mockResolvedValueOnce([disabledRow]).mockResolvedValueOnce([disabledRow]).mockResolvedValueOnce({ restartNeeded: true });
    const preview = await enable.preview(enable.validate(params), ctx);
    const result = await enable.apply(enable.validate(params), preview.precondition, ctx);
    expect(result).toMatchObject({ outcome: 'applied', undo: { kind: 'feature.disable', params } });
    expect(runFixedScript).toHaveBeenLastCalledWith('feature.setEnabled', { ...params, enabled: true }, ctx.signal);
  });

  it('conflicts when the feature changed since preview and never writes', async () => {
    runFixedScript.mockResolvedValueOnce([disabledRow]).mockResolvedValueOnce([enabledRow]);
    const preview = await enable.preview(enable.validate(params), ctx);
    expect(await enable.apply(enable.validate(params), preview.precondition, ctx)).toMatchObject({ outcome: 'conflict' });
    expect(runFixedScript).toHaveBeenCalledTimes(2);
  });

  it('provides fixed list, capability and mutation scripts', () => {
    expect(WINDOWS_FEATURE_SCRIPTS).toHaveProperty('feature.list');
    expect(WINDOWS_FEATURE_SCRIPTS).toHaveProperty('feature.capabilities');
    expect(WINDOWS_FEATURE_SCRIPTS).toHaveProperty('feature.setEnabled');
    expect(WINDOWS_FEATURE_SCRIPTS['feature.setEnabled']).toContain('$DudeArgs.name');
  });
});
