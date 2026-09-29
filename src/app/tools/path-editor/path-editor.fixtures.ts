import type { ProbeDirEntry } from '../../../shared-logic/system/system-types';

const reg = (name: string, type: string, data: string) => ({ name, type, rawType: 1, byteLength: 0, data });

export const MACHINE_PATH = '%SystemRoot%\\system32;C:\\Python312;C:\\nodeA';
export const USER_WINDOWSAPPS = '%USERPROFILE%\\AppData\\Local\\Microsoft\\WindowsApps';
export const USER_PATH = `${USER_WINDOWSAPPS};C:\\nodeB;C:\\gone;C:\\nodeA`;

const PROBE: Record<string, string[] | null> = {
  'c:\\windows\\system32': ['cmd.exe'],
  'c:\\python312': ['python.exe'],
  'c:\\nodea': ['node.exe'],
  'c:\\users\\me\\appdata\\local\\microsoft\\windowsapps': ['python.exe', 'winget.exe'],
  'c:\\nodeb': ['node.exe'],
  'c:\\gone': null,
};

/** A canned `sys.call`: registry values for the three environment keys and `fs.probeDirs` results. */
export function fakePathSysCall(methods: string[]) {
  return async (method: string, params: { hive?: string; path?: string; dirs?: string[] }) => {
    methods.push(method);
    if (method === 'reg.getValues') {
      if (params.hive === 'HKLM') return { ok: true, data: { values: [reg('Path', 'REG_EXPAND_SZ', MACHINE_PATH), reg('PATHEXT', 'REG_SZ', '.COM;.EXE;.BAT;.CMD')] } };
      if (params.path === 'Environment') return { ok: true, data: { values: [reg('Path', 'REG_EXPAND_SZ', USER_PATH)] } };
      return { ok: true, data: { values: [reg('USERPROFILE', 'REG_SZ', 'C:\\Users\\me')] } };
    }
    if (method === 'fs.probeDirs') {
      const dirs: ProbeDirEntry[] = (params.dirs ?? []).map((dir) => {
        const found = PROBE[dir.toLowerCase().replace(/\\+$/, '')];
        return found ? { dir, exists: true, isDirectory: true, executables: found } : { dir, exists: false, isDirectory: false, executables: [] };
      });
      return { ok: true, data: { dirs } };
    }
    return { ok: false, error: 'unexpected ' + method };
  };
}
