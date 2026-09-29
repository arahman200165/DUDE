import { beforeEach, describe, expect, it, vi } from 'vitest';
import { softwareUninstallOp } from './software';

const helper = vi.fn();
const launch = vi.fn();
vi.mock('../sys-mutation', () => ({}));
vi.mock('node:child_process', () => ({ spawn: (...args: unknown[]) => launch(...args) }));

const params = { hive: 'HKCU', view: 'default', keyName: 'Widget', displayName: 'Widget', uninstallString: '"C:\\Program Files\\Widget\\uninstall.exe" /remove' } as const;
const values = [{ name: 'DisplayName', type: 'REG_SZ', data: 'Widget' }, { name: 'UninstallString', type: 'REG_SZ', data: params.uninstallString }];
const ctx = { elevated: false, helper, signal: new AbortController().signal, backup: vi.fn() };

describe('software.uninstall', () => {
  beforeEach(() => { helper.mockReset().mockResolvedValue({ ok: true, data: { values } }); launch.mockReset().mockImplementation((_exe, _args, _options) => ({ once: (event: string, cb: (error?: Error) => void) => { if (event === 'spawn') cb(); } })); });

  it('validates exact registry target fields and rejects unknown fields', () => {
    expect(softwareUninstallOp.validate(params)).toEqual(params);
    expect(() => softwareUninstallOp.validate({ ...params, keyName: '..' })).toThrow();
    expect(() => softwareUninstallOp.validate({ ...params, extra: true })).toThrow();
    expect(() => softwareUninstallOp.validate({ ...params, uninstallString: 'cmd.exe /c del x' })).toThrow();
  });

  it('previews a no-undo interactive launch and conflicts if the registration changes', async () => {
    const preview = await softwareUninstallOp.preview(params, ctx);
    expect(preview).toMatchObject({ noUndo: true, before: 'Installed', after: 'Uninstaller launched' });
    helper.mockResolvedValue({ ok: true, data: { values: [{ name: 'DisplayName', data: 'Widget' }, { name: 'UninstallString', data: 'C:\\Other\\uninstall.exe' }] } });
    expect(await softwareUninstallOp.apply(params, preview.precondition, ctx)).toMatchObject({ outcome: 'conflict' });
    expect(launch).not.toHaveBeenCalled();
  });

  it('converts MSI registration to the interactive msiexec /x form', async () => {
    const msi = { ...params, uninstallString: 'MsiExec.exe /I{12345678-1234-1234-1234-123456789abc}' };
    helper.mockResolvedValue({ ok: true, data: { values: [{ name: 'DisplayName', data: 'Widget' }, { name: 'UninstallString', data: msi.uninstallString }] } });
    const preview = await softwareUninstallOp.preview(msi, ctx);
    expect((await softwareUninstallOp.apply(msi, preview.precondition, ctx)).outcome).toBe('applied');
    expect(launch).toHaveBeenCalledWith('msiexec.exe', ['/x', '{12345678-1234-1234-1234-123456789ABC}'], expect.objectContaining({ shell: false }));
  });
});
