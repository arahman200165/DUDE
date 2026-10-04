import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { HELP_TEXT, parseArgs } from '../cli/args.js';
import { hubPaths } from '../config/data-dir.js';
import { HUB_EXE } from './common.js';
import {
  ACME_RULE_NAME, PUBLIC_RULE_NAME, addAcmeRule, addPublicRule, deleteAcmeRule, deletePublicRule, inspectRule, parseRuleOutput, runFirewall, validateRule,
} from './firewall.js';
import type { ExpectedRule, InspectedRule } from './firewall.js';
import { runDoctor } from './doctor.js';
import { runServiceInstall } from './install.js';
import { runServiceUninstall } from './lifecycle.js';
import { runTlsAcme } from './tls-acme.js';
import { fixture, netshVerbose } from './test-helpers.js';

const INSTALL = path.join('C:', 'Program Files', 'DUDE Hub');
const PROGRAM = path.join(INSTALL, HUB_EXE);
const verbose = (over: Record<string, string> = {}): string => netshVerbose(PUBLIC_RULE_NAME, {
  dir: 'in', action: 'allow', protocol: 'TCP', localport: '47821', profile: 'any', program: PROGRAM, remoteip: 'any', ...over,
});
const expected: ExpectedRule = { port: 47821, program: PROGRAM, remoteAny: true };
const problemsFor = (over: Record<string, string>): string[] => validateRule(parseRuleOutput(verbose(over)), expected);

describe('firewall rules: add, delete, inspect', () => {
  it('adds the Public rule (profile=any, remoteip=any, program-scoped) and the ACME rule, replacing a stale rule', async () => {
    const f = fixture();
    await addPublicRule(f.system.exec, 47821, INSTALL);
    await addPublicRule(f.system.exec, 47822, INSTALL);
    await addAcmeRule(f.system.exec, 80, INSTALL);
    const adds = f.system.calls.filter((c) => c.includes(' add rule '));
    expect(adds[1]).toBe(`netsh advfirewall firewall add rule name=${PUBLIC_RULE_NAME} dir=in action=allow protocol=TCP localport=47822 profile=any program=${PROGRAM} remoteip=any`);
    expect(adds[2]).toContain(`name=${ACME_RULE_NAME}`);
    expect(f.system.rules.get(PUBLIC_RULE_NAME)?.['localport']).toBe('47822');
    expect(await inspectRule(f.system.exec, PUBLIC_RULE_NAME)).toMatchObject({
      present: true, parsed: true, localPort: '47822', profiles: ['domain', 'private', 'public'], action: 'allow', direction: 'in', remoteIp: 'Any', enabled: true,
    });
    expect(f.system.firewallRule).toBe(false); // the LAN rule is never touched
    await deletePublicRule(f.system.exec);
    await deleteAcmeRule(f.system.exec);
    expect(f.system.rules.size).toBe(0);
    expect((await deletePublicRule(f.system.exec)).code).toBe(1); // absent: netsh reports it, callers treat it as idempotent
    expect(await inspectRule(f.system.exec, PUBLIC_RULE_NAME)).toEqual({ present: false, parsed: false });
  });

  it('parseRuleOutput tolerates odd whitespace and reports unknown formats as present but unparsed', () => {
    const odd = 'Rule Name:DUDE Hub (Public)\r\n  Enabled :   yes\r\nDirection:In\r\nProfiles:Any\r\nProtocol:TCP\r\nLocalPort:  47821 \r\nRemoteIP:Any\r\nProgram:C:\\x\\dude-hub.exe\r\nAction:Allow\r\n';
    expect(parseRuleOutput(odd)).toMatchObject({ parsed: true, localPort: '47821', program: 'C:\\x\\dude-hub.exe', profiles: ['domain', 'private', 'public'] });
    expect(parseRuleOutput('Nombre de regla: x\r\nHabilitada: si\r\n')).toEqual({ present: true, parsed: false });
    expect(parseRuleOutput('')).toEqual({ present: true, parsed: false });
  });
});

describe('validateRule', () => {
  it('accepts a correct rule', () => {
    expect(problemsFor({})).toEqual([]);
    expect(problemsFor({ program: PROGRAM.toLowerCase() })).toEqual([]);
    expect(problemsFor({ localport: '1-100,47821' })).toEqual([]);
  });
  it('reports wrong port, disabled, block, wrong program, narrower profile, outbound and restricted remote', () => {
    expect(problemsFor({ localport: '9999' })[0]).toMatch(/port 9999, not 47821/);
    expect(problemsFor({ enable: 'no' })).toEqual(['The rule is disabled.']);
    expect(problemsFor({ action: 'block' })).toEqual(['The rule blocks traffic instead of allowing it.']);
    expect(problemsFor({ program: 'C:\\evil\\other.exe' })[0]).toMatch(/scoped to program/);
    expect(problemsFor({ profile: 'private' })[0]).toMatch(/must also cover domain, public/);
    expect(problemsFor({ dir: 'out' })[0]).toMatch(/outbound/);
    expect(problemsFor({ remoteip: '10.0.0.0/8' })[0]).toMatch(/restricted to remote address 10\.0\.0\.0\/8/);
    expect(validateRule(parseRuleOutput(verbose({ remoteip: '10.0.0.0/8' })), { port: 47821, program: PROGRAM })).toEqual([]);
  });
  it('reports a missing or unparseable rule', () => {
    expect(validateRule({ present: false, parsed: false }, expected)).toEqual(['The rule does not exist.']);
    const unknown: InspectedRule = { present: true, parsed: false };
    expect(validateRule(unknown, expected)[0]).toMatch(/could not be read/);
  });
});

describe('network firewall CLI: parsing', () => {
  it('parses public and acme on|off|status with flags and rejects the rest', () => {
    expect(parseArgs(['network', 'firewall', 'public', 'on', '--force', '--data-dir', 'd', '--install-dir', 'i'])).toEqual({ command: 'network-firewall', target: 'public', action: 'on', force: true, dataDir: 'd', installDir: 'i' });
    expect(parseArgs(['network', 'firewall', 'public', 'status'])).toEqual({ command: 'network-firewall', target: 'public', action: 'status' });
    expect(parseArgs(['network', 'firewall', 'acme', 'off'])).toEqual({ command: 'network-firewall', target: 'acme', action: 'off' });
    expect(() => parseArgs(['network', 'firewall', 'acme', 'on', '--force'])).toThrow(/Unknown flag/);
    expect(() => parseArgs(['network', 'firewall', 'lan', 'on'])).toThrow(/Usage/);
    expect(() => parseArgs(['network', 'firewall', 'public'])).toThrow(/Usage/);
    expect(parseArgs(['tls', 'acme', 'issue', '--name', 'h.example.com', '--open-firewall'])).toMatchObject({ command: 'tls-acme', openFirewall: true });
    expect(parseArgs(['tls', 'acme', 'issue', '--name', 'h.example.com'])).not.toHaveProperty('openFirewall');
  });
  it('documents the commands in help', async () => {
    const text = HELP_TEXT;
    expect(text).toContain('network firewall public on|off|status');
    expect(text).toContain('network firewall acme on|off|status');
    expect(text).toContain('--open-firewall');
  });
});

const writeConfig = (dataDir: string, exposure: Record<string, unknown>, port = 48200): void => {
  const paths = hubPaths(dataDir);
  mkdirSync(paths.configDir, { recursive: true });
  writeFileSync(paths.configFile, JSON.stringify({ port, bind: 'loopback', exposure }));
};
const installed = async () => {
  const f = fixture();
  await runServiceInstall({ installDir: f.installDir, dataDir: f.dataDir, port: 48200 }, f.deps);
  f.system.calls.length = 0; f.out.length = 0; f.err.length = 0;
  return f;
};
type Installed = Awaited<ReturnType<typeof installed>>;
const dirs = (f: Installed) => ({ installDir: f.installDir, dataDir: f.dataDir });

describe('runFirewall', () => {
  it('refuses without elevation when the service is installed; leaves everything alone', async () => {
    const f = await installed();
    f.system.elevated = false;
    expect(await runFirewall({ target: 'public', action: 'on', force: true, ...dirs(f) }, f.deps)).toBe(2);
    expect(f.err.join('')).toMatch(/elevated/);
    expect(f.system.rules.size).toBe(0);
  });

  it('public on is refused outside public mode, allowed with --force or in public mode, and uses the configured port', async () => {
    const f = await installed();
    writeConfig(f.dataDir, { mode: 'private', names: [] });
    expect(await runFirewall({ target: 'public', action: 'on', ...dirs(f) }, f.deps)).toBe(2);
    expect(f.err.join('')).toMatch(/public mode only/);
    expect(f.system.rules.size).toBe(0);
    expect(await runFirewall({ target: 'public', action: 'on', force: true, ...dirs(f) }, f.deps)).toBe(0);
    expect(f.system.rules.get(PUBLIC_RULE_NAME)).toMatchObject({ localport: '48200', profile: 'any', remoteip: 'any' });
    f.system.rules.clear();
    writeConfig(f.dataDir, { mode: 'public', names: [] });
    expect(await runFirewall({ target: 'public', action: 'on', ...dirs(f) }, f.deps)).toBe(0);
    expect(f.system.rules.has(PUBLIC_RULE_NAME)).toBe(true);
    expect(f.system.firewallRule).toBe(false);
  });

  it('status prints the inspected and validated rule; off is idempotent and never touches the LAN rule', async () => {
    const f = await installed();
    f.system.firewallRule = true;
    writeConfig(f.dataDir, { mode: 'public', names: [] });
    await runFirewall({ target: 'public', action: 'on', ...dirs(f) }, f.deps);
    f.out.length = 0;
    expect(await runFirewall({ target: 'public', action: 'status', ...dirs(f) }, f.deps)).toBe(0);
    expect(JSON.parse(f.out.join(''))).toMatchObject({ rule: PUBLIC_RULE_NAME, inspected: { present: true, parsed: true }, problems: [] });
    f.system.rules.get(PUBLIC_RULE_NAME)!['localport'] = '1';
    f.out.length = 0;
    await runFirewall({ target: 'public', action: 'status', ...dirs(f) }, f.deps);
    expect((JSON.parse(f.out.join('')) as { problems: string[] }).problems[0]).toMatch(/local port 1/);
    for (let i = 0; i < 2; i++) expect(await runFirewall({ target: 'public', action: 'off', ...dirs(f) }, f.deps)).toBe(0);
    expect(f.system.rules.size).toBe(0);
    expect(f.system.firewallRule).toBe(true);
  });

  it('acme on uses exposure.acme.httpPort (default 80)', async () => {
    const f = await installed();
    writeConfig(f.dataDir, { mode: 'public', names: [], acme: { directoryUrl: 'https://acme-staging-v02.api.letsencrypt.org/directory', httpPort: 8080 } });
    await runFirewall({ target: 'acme', action: 'on', ...dirs(f) }, f.deps);
    expect(f.system.rules.get(ACME_RULE_NAME)?.['localport']).toBe('8080');
    await runFirewall({ target: 'acme', action: 'off', ...dirs(f) }, f.deps);
    writeConfig(f.dataDir, { mode: 'public', names: [] });
    await runFirewall({ target: 'acme', action: 'on', ...dirs(f) }, f.deps);
    expect(f.system.rules.get(ACME_RULE_NAME)?.['localport']).toBe('80');
  });

  it('is a clear no-op off Windows', async () => {
    const f = fixture();
    expect(await runFirewall({ target: 'public', action: 'on', ...dirs(f) }, { ...f.deps, platform: 'linux' })).toBe(0);
    expect(f.err.join('')).toMatch(/Not applicable/);
    f.out.length = 0;
    await runFirewall({ target: 'public', action: 'status', dataDir: f.dataDir }, { ...f.deps, platform: 'linux' });
    expect(JSON.parse(f.out.join(''))).toMatchObject({ applicable: false });
    expect(f.system.calls).toEqual([]);
  });
});

describe('tls acme issue --open-firewall', () => {
  const acmeCall = (onIssue?: () => void, failIssue = false) => async (_d: string, method: string): Promise<unknown> => {
    if (method === 'tls.acme.issue') {
      onIssue?.();
      if (failIssue) throw new Error('order failed');
    }
    return method === 'status' ? { bind: 'loopback' } : { configured: true };
  };
  const issue = (f: Installed, call: (d: string, m: string) => Promise<unknown>, extra: Record<string, unknown> = {}) =>
    runTlsAcme({ action: 'issue', names: ['hub.example.com'], agreeTos: true, openFirewall: true, ...dirs(f), ...extra }, { ...f.deps, call });

  it('adds the ACME rule before the order and removes it afterwards, on success and when the order fails', async () => {
    const f = await installed();
    writeConfig(f.dataDir, { mode: 'public', names: [], acme: { directoryUrl: 'https://acme-staging-v02.api.letsencrypt.org/directory', httpPort: 8081 } });
    const seen: boolean[] = [];
    expect(await issue(f, acmeCall(() => seen.push(f.system.rules.get(ACME_RULE_NAME)?.['localport'] === '8081')))).toBe(0);
    expect(seen).toEqual([true]);
    expect(f.system.rules.size).toBe(0);
    expect(await issue(f, acmeCall(undefined, true))).toBe(1);
    expect(f.err.join('')).toContain('order failed');
    expect(f.system.rules.size).toBe(0);
  });

  it('reports a removal failure loudly, and uses --http-port over the config', async () => {
    const f = await installed();
    const base = f.system.exec;
    let opened = false;
    f.deps.exec = async (file, args) => {
      if (args[2] === 'add') opened = true;
      if (opened && args[2] === 'delete' && args.includes(`name=${ACME_RULE_NAME}`)) return { stdout: '', stderr: 'Access is denied.', code: 5 };
      return base(file, args);
    };
    await issue(f, acmeCall(), { httpPort: 8099 });
    expect(f.system.rules.get(ACME_RULE_NAME)?.['localport']).toBe('8099');
    expect(f.err.join('')).toContain('port 8099');
    expect(f.err.join('')).toMatch(/WARNING: the ACME firewall rule .* could not be removed/);
  });

  it('without the flag no firewall command runs; not elevated is refused before anything happens', async () => {
    const f = await installed();
    await runTlsAcme({ action: 'issue', names: ['hub.example.com'], ...dirs(f) }, { ...f.deps, call: acmeCall() });
    expect(f.system.calls.some((c) => c.startsWith('netsh'))).toBe(false);
    f.system.elevated = false;
    expect(await issue(f, acmeCall())).toBe(2);
    expect(f.system.calls.some((c) => c.startsWith('netsh'))).toBe(false);
  });

  it('is ignored with a note when no Windows service is installed', async () => {
    const f = fixture();
    expect(await runTlsAcme({ action: 'issue', names: ['hub.example.com'], openFirewall: true, ...dirs(f) as { installDir: string; dataDir: string } }, { ...f.deps, call: acmeCall() })).toBe(0);
    expect(f.err.join('')).toMatch(/applies only to an installed Windows service/);
    expect(f.system.calls.some((c) => c.startsWith('netsh'))).toBe(false);
  });
});

describe('service lifecycle and the Public/ACME rules', () => {
  it('install leaves them absent; uninstall removes them (and tolerates their absence)', async () => {
    const f = fixture();
    await runServiceInstall({ installDir: f.installDir, dataDir: f.dataDir, port: 48200 }, f.deps);
    expect(f.system.rules.size).toBe(0);
    await addPublicRule(f.system.exec, 48200, f.installDir);
    await addAcmeRule(f.system.exec, 80, f.installDir);
    expect(await runServiceUninstall({ installDir: f.installDir, dataDir: f.dataDir }, f.deps)).toBe(0);
    expect(f.system.rules.size).toBe(0);
    const g = fixture();
    await runServiceInstall({ installDir: g.installDir, dataDir: g.dataDir, port: 48200 }, g.deps);
    expect(await runServiceUninstall({ installDir: g.installDir, dataDir: g.dataDir }, g.deps)).toBe(0);
  });
});

describe('doctor gathers the public-firewall and native-listener facts', () => {
  const checks = (f: Installed): Record<string, { status: string; basis: string; fix?: string; detail: string }> =>
    Object.fromEntries((JSON.parse(f.out.join('')) as { checks: { id: string; status: string; basis: string; detail: string }[] }).checks.map((c) => [c.id, c]));

  it('public mode: missing rule warns with the command, a valid rule passes; an Agent listener fails', async () => {
    const f = await installed();
    writeConfig(f.dataDir, { mode: 'public', names: [] });
    const base = f.system.exec;
    f.deps.exec = async (file, args) => {
      if (file === 'netstat') return { stdout: args.includes('TCPv6') ? '' : '  TCP    127.0.0.1:5555    0.0.0.0:0    LISTENING    7000\r\n', stderr: '', code: 0 };
      if (file === 'tasklist') return { stdout: '"dude-agent.exe","7000","Console","1","1 K"\r\n', stderr: '', code: 0 };
      return base(file, args);
    };
    await runDoctor({ hubVersion: '1', json: true, ...dirs(f) }, f.deps);
    expect(checks(f)['public-firewall-rule']).toMatchObject({ status: 'warn', basis: 'verified', fix: 'dude-hub network firewall public on' });
    expect(checks(f)['native-ports-exposed']).toMatchObject({ status: 'fail', basis: 'verified' });
    await runFirewall({ target: 'public', action: 'on', ...dirs(f) }, f.deps);
    f.out.length = 0;
    await runDoctor({ hubVersion: '1', json: true, ...dirs(f) }, f.deps);
    expect(checks(f)['public-firewall-rule']).toMatchObject({ status: 'pass', basis: 'verified' });
  });

  it('a running Hub reports not-checked; the elevated doctor replaces those two checks', async () => {
    const f = await installed();
    writeConfig(f.dataDir, { mode: 'public', names: [] });
    f.system.state = 'stopped';
    await runDoctor({ hubVersion: '1', json: true, ...dirs(f) }, f.deps);
    const offline = JSON.parse(f.out.join('')) as { checks: { id: string }[] };
    f.out.length = 0;
    const call = async (_d: string, method: string): Promise<unknown> => (method === 'diagnostics'
      ? { ...offline, checks: offline.checks.map((c) => (c.id === 'public-firewall-rule' ? { ...c, status: 'info', basis: 'not-checked', detail: 'x' } : c)) } : { schemaVersion: 2 });
    await runDoctor({ hubVersion: '1', json: true, ...dirs(f) }, { ...f.deps, call });
    expect(checks(f)['public-firewall-rule']).toMatchObject({ status: 'warn', basis: 'verified' });
  });
});
