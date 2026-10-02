import { describe, expect, it } from 'vitest';
import { dllSearchLimitation, planDllSearch, type DllSearchContext } from "./dll-search-order.js";

const context: DllSearchContext = {
  applicationDirectory: 'C:\\App', windowsDirectory: 'C:\\Windows', systemDirectory: 'C:\\Windows\\System32',
  syswow64Directory: 'C:\\Windows\\SysWOW64', targetArchitecture: 'x86', pathDirectories: ['C:\\Tools'],
};

describe('planDllSearch', () => {
  it('uses KnownDLL direct binding before filesystem candidates', () => {
    const result = planDllSearch('kernel32.dll', { ...context, knownDlls: { 'KERNEL32.DLL': true } });
    expect(result.candidates).toEqual([{ path: 'C:\\Windows\\SysWOW64\\kernel32.dll', source: 'known-dll', requestedName: 'kernel32.dll', resolvedName: 'kernel32.dll' }]);
  });

  it('uses the x86 KnownDLL view when resolving a 32-bit image', () => {
    const result = planDllSearch('native.dll', { ...context, knownDlls: { 'native.dll': 'C:\\Windows\\System32\\native.dll' }, knownDllsX86: { 'native.dll': true } });
    expect(result.candidates).toEqual([{ path: 'C:\\Windows\\SysWOW64\\native.dll', source: 'known-dll', requestedName: 'native.dll', resolvedName: 'native.dll' }]);
  });
  it('orders an x86 image through SysWOW64 before Windows and PATH', () => {
    const result = planDllSearch('thing.dll', context);
    expect(result.candidates.map((entry) => [entry.source, entry.path])).toEqual([
      ['application', 'C:\\App\\thing.dll'], ['system', 'C:\\Windows\\SysWOW64\\thing.dll'],
      ['windows', 'C:\\Windows\\thing.dll'], ['path', 'C:\\Tools\\thing.dll'],
    ]);
  });

  it('maps API-set contracts to host DLLs before searching', () => {
    const result = planDllSearch('api-ms-win-core-file-l1-1-0.dll', {
      ...context, apiSetMap: { 'api-ms-win-core-file-l1-1-0': ['kernelbase'] },
    });
    expect(result.apiSetResolved).toBe(true);
    expect(result.candidates[0].resolvedName).toBe('kernelbase.dll');
  });

  it('resolves any revision of a contract (the map stores the highest) and ext- sets', () => {
    const apiSetMap = { 'api-ms-win-core-libraryloader-l1-2-3': ['kernelbase.dll'], 'ext-ms-win32-subsystem-query-l1-1-0': ['user32.dll'] };
    const older = planDllSearch('api-ms-win-core-libraryloader-l1-2-0.dll', { ...context, apiSetMap });
    expect(older.apiSetResolved).toBe(true);
    expect(older.candidates[0].resolvedName).toBe('kernelbase.dll');
    expect(planDllSearch('ext-ms-win32-subsystem-query-l1-1-0.dll', { ...context, apiSetMap }).apiSetResolved).toBe(true);
    expect(planDllSearch('api-ms-win-core-libraryloader-l1-1-0.dll', { ...context, apiSetMap }).apiSetResolved).toBe(false);
  });

  it('reports unresolved API sets and side-by-side names explicitly', () => {
    const missingApi = planDllSearch('api-ms-win-unknown-l1-1-0.dll', context);
    expect(dllSearchLimitation(missingApi)).toContain('API-set');
    const sxs = planDllSearch('Microsoft.VC90.CRT,version="9.0"', context);
    expect(sxs.sxsUnresolved).toBe(true);
    expect(dllSearchLimitation(sxs)).toContain('Side-by-side');
  });
});

