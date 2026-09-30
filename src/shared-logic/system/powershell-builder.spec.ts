import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { analyzePowerShellScript, buildPowerShellScript, quotePowerShellString, type PowerShellCmdletDefinition } from './powershell-builder';

const catalog: PowerShellCmdletDefinition[] = [{
  name: 'Get-Process',
  parameterSets: [
    { name: 'ByName', parameters: [{ name: 'Name', type: 'string[]', mandatory: true }, { name: 'IncludeUserName', type: 'boolean' }] },
    { name: 'ById', parameters: [{ name: 'Id', type: 'number[]', mandatory: true }] },
  ],
}, {
  name: 'Set-Mode',
  parameterSets: [{ name: 'Default', parameters: [{ name: 'Mode', type: 'string', mandatory: true, validateSet: ['Safe', 'Fast'] }] }],
}];

describe('PowerShell builder', () => {
  it('quotes arbitrary strings as PowerShell single-quoted literals', () => {
    fc.assert(fc.property(fc.string(), (value) => {
      expect(quotePowerShellString(value)).toBe(`'${value.replace(/'/g, "''")}'`);
    }));
  });

  it('renders deterministic catalog pipelines with typed values and formatting', () => {
    const result = buildPowerShellScript([
      { cmdlet: 'Get-Process', parameters: { Name: ['a b', "x'y"] } },
      { cmdlet: 'Set-Mode', parameters: { Mode: 'Safe' } },
    ], { kind: 'json', depth: 4 }, catalog);
    expect(result.script).toBe("Get-Process -Name @('a b', 'x''y') | Set-Mode -Mode 'Safe' | ConvertTo-Json -Depth 4");
    expect(new TextDecoder().decode(result.utf8)).toBe(result.script);
    expect(result.warnings.map((warning) => warning.cmdlet)).toEqual(['Set-Mode']);
  });

  it('renders false explicitly and warns for destructive verbs', () => {
    const result = buildPowerShellScript([{ cmdlet: 'Remove-Item', parameters: { Path: 'C:\\temp' } }], { kind: 'none' }, [
      { name: 'Remove-Item', parameterSets: [{ name: 'Path', parameters: [{ name: 'Path', type: 'string', mandatory: true }] }] },
    ]);
    expect(result.script).toBe("Remove-Item -Path 'C:\\temp'");
    expect(result.warnings).toHaveLength(1);
    const boolResult = buildPowerShellScript([{ cmdlet: 'Get-Process', parameters: { Name: ['pwsh'], IncludeUserName: false } }], { kind: 'none' }, catalog);
    expect(boolResult.script).toContain('-IncludeUserName:$false');
  });

  it('rejects unsafe command and parameter names from a catalog', () => {
    expect(() => buildPowerShellScript([{ cmdlet: 'Get-Item; Remove-Item', parameters: {} }], { kind: 'none' }, [
      { name: 'Get-Item; Remove-Item', parameterSets: [{ name: 'Default', parameters: [] }] },
    ])).toThrow(/unsafe name/);
    expect(() => buildPowerShellScript([{ cmdlet: 'Get-Item', parameters: {} }], { kind: 'none' }, [
      { name: 'Get-Item', parameterSets: [{ name: 'Default', parameters: [{ name: 'Path;Exit', type: 'string' }] }] },
    ])).toThrow(/unsafe name/);
  });

  it('rejects missing required parameters, invalid ValidateSet entries, and non-finite numbers', () => {
    expect(() => buildPowerShellScript([{ cmdlet: 'Get-Process', parameters: {} }], { kind: 'none' }, catalog)).toThrow(/mandatory/);
    expect(() => buildPowerShellScript([{ cmdlet: 'Set-Mode', parameters: { Mode: 'Unsafe' } }], { kind: 'none' }, catalog)).toThrow(/allowed set/);
    expect(() => buildPowerShellScript([{ cmdlet: 'Get-Process', parameters: { Id: [Number.NaN] } }], { kind: 'none' }, catalog)).toThrow(/numeric array/);
  });
});


describe('PowerShell builder quoting hardening', () => {
  const typed: PowerShellCmdletDefinition[] = [{
    name: 'Set-Thing',
    parameterSets: [{ name: 'Default', parameters: [
      { name: 'Count', type: 'number' }, { name: 'Tags', type: 'hashtable' }, { name: 'Force', type: 'switch' }, { name: 'Text', type: 'string' },
    ] }],
  }];

  it('doubles the typographic apostrophes PowerShell also treats as quotes', () => {
    expect(quotePowerShellString('a’b‘c‚d‛e')).toBe('\'a’’b‘‘c‚‚d‛‛e\'');
  });

  it('keeps $, backticks and newlines inert inside single quotes', () => {
    const result = buildPowerShellScript([{ cmdlet: 'Set-Thing', parameters: { Text: '$(Remove-Item x)`n\r\n${y}' } }], { kind: 'none' }, typed);
    expect(result.script).toBe("Set-Thing -Text '$(Remove-Item x)`n\r\n${y}'");
  });

  it('parenthesises negative and exponent numbers, renders hashtables and explicit switches', () => {
    const result = buildPowerShellScript([{ cmdlet: 'Set-Thing', parameters: { Count: -5, Tags: { 'a b': "it's", n: 2, ok: true }, Force: false } }], { kind: 'select', properties: ['A'] }, typed);
    expect(result.script).toBe("Set-Thing -Count (-5) -Tags @{ 'a b' = 'it''s'; 'n' = 2; 'ok' = $true } -Force:$false | Select-Object -Property @('A')");
    expect(buildPowerShellScript([{ cmdlet: 'Set-Thing', parameters: { Count: 1e21 } }], { kind: 'none' }, typed).script).toBe('Set-Thing -Count (1e+21)');
  });
});

describe('analyzePowerShellScript', () => {
  it('flags destructive verbs, eval, RunAs and registry writes as warnings only', () => {
    const codes = (script: string) => analyzePowerShellScript(script).map((warning) => warning.code);
    expect(codes('Get-ChildItem | Remove-Item -Recurse')).toEqual(['destructive-verb']);
    expect(codes('Set-ExecutionPolicy Bypass; Restart-Computer; Format-Volume -DriveLetter D')).toEqual(['destructive-verb', 'destructive-verb', 'destructive-verb']);
    expect(codes('iex (irm x)')).toContain('code-eval');
    expect(codes('Invoke-Expression $x')).toContain('code-eval');
    expect(codes("Start-Process cmd -Verb RunAs")).toContain('elevation');
    expect(codes("Set-ItemProperty HKLM:\Software\X -Name a -Value 1")).toContain('registry-write');
    expect(codes('reg add HKCU\Software\X')).toContain('registry-write');
    expect(codes('Get-Date')).toEqual([]);
  });
});
