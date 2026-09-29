import { describe, expect, it, vi } from 'vitest';
import { FIXED_SCRIPTS, buildFixedScriptCommand, detectPwsh, type PwshDeps } from './sys-pwsh';

const LOCAL = 'C:\\Users\\me\\AppData\\Local';
const ALIAS = `${LOCAL}\\Microsoft\\WindowsApps\\pwsh.exe`;
const PF = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';

function deps(present: string[], versions: Record<string, string | Error>, pathVar = ''): PwshDeps & { run: ReturnType<typeof vi.fn> } {
  const lower = present.map((p) => p.toLowerCase());
  return {
    env: { PATH: pathVar, ProgramFiles: 'C:\\Program Files', LOCALAPPDATA: LOCAL },
    exists: (path) => lower.includes(path.toLowerCase()),
    run: vi.fn(async (file: string) => {
      const value = versions[file];
      if (value === undefined) throw new Error('not found');
      if (value instanceof Error) throw value;
      return `${value}\r\n`;
    }),
  };
}

describe('detectPwsh', () => {
  it('prefers the first pwsh.exe on PATH and classifies it', async () => {
    const d = deps(['D:\\tools\\pwsh.exe', PF, ALIAS], { 'D:\\tools\\pwsh.exe': '7.4.1', [PF]: '7.5.0' }, 'C:\\other;D:\\tools');
    expect(await detectPwsh(d)).toEqual({ available: true, path: 'D:\\tools\\pwsh.exe', version: '7.4.1', source: 'path' });
  });

  it('classifies a WindowsApps PATH entry as windows-apps', async () => {
    const dir = `${LOCAL}\\microsoft\\WINDOWSAPPS`;
    const d = deps([`${dir}\\pwsh.exe`], { [`${dir}\\pwsh.exe`]: '7.6.6' }, `C:\\x;${dir}`);
    expect(await detectPwsh(d)).toMatchObject({ available: true, source: 'windows-apps', version: '7.6.6' });
  });

  it('falls back to Program Files, then the App Execution Alias', async () => {
    expect(await detectPwsh(deps([PF, ALIAS], { [PF]: '7.5.0', [ALIAS]: '7.6.6' }))).toMatchObject({ path: PF, source: 'program-files' });
    expect(await detectPwsh(deps([ALIAS], { [ALIAS]: '7.6.6' }))).toEqual({ available: true, path: ALIAS, version: '7.6.6', source: 'windows-apps' });
  });

  it('skips a version below 7 and continues, or names it when nothing newer exists', async () => {
    const d = deps(['D:\\old\\pwsh.exe', ALIAS], { 'D:\\old\\pwsh.exe': '6.2.7', [ALIAS]: '7.6.6' }, 'D:\\old');
    expect(await detectPwsh(d)).toMatchObject({ available: true, path: ALIAS });
    const old = await detectPwsh(deps(['D:\\old\\pwsh.exe'], { 'D:\\old\\pwsh.exe': '6.2.7' }, 'D:\\old'));
    expect(old.available).toBe(false);
    expect(old.reason).toMatch(/6\.2\.7/);
  });

  it('skips a candidate whose version run fails', async () => {
    const d = deps([PF, ALIAS], { [PF]: new Error('x'), [ALIAS]: '7.6.6' });
    expect(await detectPwsh(d)).toMatchObject({ path: ALIAS });
  });

  it('reports not found', async () => {
    const result = await detectPwsh(deps([], {}));
    expect(result).toEqual({ available: false, reason: 'PowerShell 7 was not found. Install it with: winget install --id Microsoft.PowerShell' });
  });

  it('runs the version probe with the required flags and timeout', async () => {
    const d = deps([ALIAS], { [ALIAS]: '7.6.6' });
    await detectPwsh(d);
    expect(d.run).toHaveBeenCalledWith(ALIAS, ['-NoProfile', '-NonInteractive', '-Command', '$PSVersionTable.PSVersion.ToString()'], 10_000);
  });
});

describe('buildFixedScriptCommand', () => {
  const hostile = [
    { text: "'); Remove-Item C:\\ -Recurse; ('" },
    { text: '$(evil)' },
    { text: 'back`tick`n' },
    { text: 'mix \' " $(x) `y` ; & | <#' },
  ];

  it('carries arguments only inside the base64 literal', () => {
    for (const args of hostile) {
      const command = buildFixedScriptCommand('pwsh.echo', args);
      const match = /FromBase64String\('([A-Za-z0-9+/=]*)'\)/.exec(command);
      expect(match).not.toBeNull();
      expect(JSON.parse(Buffer.from(match![1], 'base64').toString('utf8'))).toEqual(args);
      const withoutLiteral = command.replace(match![1], '');
      for (const bad of ["Remove-Item", '$(evil)', '`', 'evil', args.text]) expect(withoutLiteral).not.toContain(bad);
      expect(command).not.toContain(args.text);
      expect(command).toContain('@($DudeArgs) | ConvertTo-Json -Compress -Depth 8');
    }
  });

  it('builds the argument-free network view scripts', () => {
    for (const name of ['net.neighbors', 'net.routes', 'net.interfaces']) {
      const command = buildFixedScriptCommand(name, undefined);
      expect(command).toContain(FIXED_SCRIPTS[name]);
      expect(command).toContain('Get-Net');
      const literal = /FromBase64String\('([^']*)'\)/.exec(command)![1];
      expect(Buffer.from(literal, 'base64').toString('utf8')).toBe('null');
    }
  });

  it('encodes null/undefined args as JSON null and rejects unknown names', () => {
    for (const args of [undefined, null]) {
      const command = buildFixedScriptCommand('pwsh.echo', args);
      const literal = /FromBase64String\('([^']*)'\)/.exec(command)![1];
      expect(Buffer.from(literal, 'base64').toString('utf8')).toBe('null');
    }
    expect(() => buildFixedScriptCommand('pwsh.nope', {})).toThrow(/Unknown/);
    expect(() => buildFixedScriptCommand('__proto__', {})).toThrow(/Unknown/);
    expect(() => buildFixedScriptCommand('toString', {})).toThrow(/Unknown/);
  });
});
