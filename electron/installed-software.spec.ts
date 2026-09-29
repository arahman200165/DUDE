import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listInstalledSoftware, safeVendorCommand } from './installed-software';

const call = vi.fn();
const runFixedScript = vi.fn();
vi.mock('./sys-helper', () => ({ sysHelper: () => ({ call }) }));
vi.mock('./sys-pwsh', () => ({ runFixedScript: (...args: unknown[]) => runFixedScript(...args) }));

describe('installed software reader', () => {
  beforeEach(() => {
    call.mockReset().mockImplementation(async (method: string, params: { path: string }) => {
      if (method === 'reg.enumKey') return { ok: true, data: { subkeys: params.path.endsWith('Uninstall') ? [{ name: '{A}', subkeyCount: 0, valueCount: 1, lastWriteMs: 0 }, { name: 'Widget', subkeyCount: 0, valueCount: 5, lastWriteMs: 0 }] : [] } };
      if (params.path.endsWith('\\Widget')) return { ok: true, data: { values: [
        { name: 'DisplayName', type: 'REG_SZ', data: 'Widget' },
        { name: 'Publisher', type: 'REG_SZ', data: 'Acme' },
        { name: 'EstimatedSize', type: 'REG_DWORD', data: 12 },
        { name: 'InstallDate', type: 'REG_SZ', data: '20250131' },
        { name: 'UninstallString', type: 'REG_SZ', data: '"C:\\Program Files\\Widget\\uninstall.exe" /remove' },
      ] } };
      return { ok: true, data: { values: [] } };
    });
    runFixedScript.mockResolvedValue([{ name: 'Store App', packageFullName: 'Store_1.0_x64', publisher: 'Contoso' }]);
  });

  it('reads each uninstall view, normalizes values, and adds Appx entries as copy-only rows', async () => {
    const rows = await listInstalledSoftware();
    expect(call).toHaveBeenCalledWith('reg.enumKey', expect.objectContaining({ hive: 'HKLM', view: '64' }));
    expect(call).toHaveBeenCalledWith('reg.enumKey', expect.objectContaining({ hive: 'HKLM', view: '32' }));
    expect(rows.find((row) => row.name === 'Widget')).toMatchObject({ publisher: 'Acme', estimatedSizeBytes: 12288, installDate: '20250131', uninstallable: true });
    expect(rows.find((row) => row.source === 'appx')).toMatchObject({ uninstallable: false, publisher: 'Contoso' });
    expect(runFixedScript).toHaveBeenCalledWith('software.appx', {}, expect.any(AbortSignal));
  });

  it('rejects shell and script-host command forms', () => {
    expect(safeVendorCommand('"C:\\Apps\\remove.exe" /uninstall')).toBe(true);
    expect(safeVendorCommand('cmd.exe /c remove')).toBe(false);
    expect(safeVendorCommand('C:\\Apps\\remove.exe & calc.exe')).toBe(false);
  });
});
