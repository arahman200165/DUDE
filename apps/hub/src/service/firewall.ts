import { existsSync } from 'node:fs';
import path from 'node:path';
import { hubPaths } from '../config/data-dir.js';
import { defaultHubConfig, loadOrCreateHubConfig } from '../config/hub-config.js';
import type { HubConfig } from '../config/hub-config.js';
import {
  EXIT_FAILURE, EXIT_OK, EXIT_USAGE, HUB_EXE, defaultInstallDir, json, requireElevated, resolveDeps, serviceDataDir, serviceState,
} from './common.js';
import type { ExecFn, ExecResult, ServiceDeps } from './common.js';

/**
 * Public-mode Windows Firewall rules (PD-068). Both rules are managed ONLY by the elevated CLI (`dude-hub network firewall ...`,
 * `tls acme issue --open-firewall`, `service uninstall`); the running Hub never changes the firewall. UPnP / NAT-PMP is never used,
 * and no rule ever names the Device Agent or the desktop app: the Agent has no TCP port at all.
 */
export const PUBLIC_RULE_NAME = 'DUDE Hub (Public)';
export const ACME_RULE_NAME = 'DUDE Hub (ACME http-01)';
export const DEFAULT_ACME_HTTP_PORT = 80;
export const ALL_PROFILES: readonly string[] = ['domain', 'private', 'public'];

const netsh = (exec: ExecFn, ...args: string[]): Promise<ExecResult> => exec('netsh', ['advfirewall', 'firewall', ...args]);

function deleteRule(exec: ExecFn, name: string): Promise<ExecResult> {
  return netsh(exec, 'delete', 'rule', `name=${name}`);
}

async function addRule(exec: ExecFn, name: string, port: number, installDir: string): Promise<ExecResult> {
  await deleteRule(exec, name); // idempotent: never leave a stale port or program path
  return netsh(exec, 'add', 'rule', `name=${name}`, 'dir=in', 'action=allow', 'protocol=TCP', `localport=${port}`, 'profile=any', `program=${path.join(installDir, HUB_EXE)}`, 'remoteip=any');
}

/** Inbound allow on the Hub port for every profile and address (Internet exposure needs Public-profile networks). */
export const addPublicRule = (exec: ExecFn, port: number, installDir: string): Promise<ExecResult> => addRule(exec, PUBLIC_RULE_NAME, port, installDir);
export const deletePublicRule = (exec: ExecFn): Promise<ExecResult> => deleteRule(exec, PUBLIC_RULE_NAME);
/** Inbound allow on the ACME http-01 port. Meant to exist only while a certificate order runs. */
export const addAcmeRule = (exec: ExecFn, httpPort: number, installDir: string): Promise<ExecResult> => addRule(exec, ACME_RULE_NAME, httpPort, installDir);
export const deleteAcmeRule = (exec: ExecFn): Promise<ExecResult> => deleteRule(exec, ACME_RULE_NAME);

export interface InspectedRule {
  /** `netsh show rule` answered with a zero exit. */
  present: boolean;
  /** The output carried the fields below; false for an unknown (for instance localized) format. */
  parsed: boolean;
  name?: string;
  enabled?: boolean;
  direction?: 'in' | 'out';
  /** Lower-case profile names; `any`/`all` is expanded to domain, private, public. */
  profiles?: string[];
  protocol?: string;
  localPort?: string;
  action?: 'allow' | 'block';
  program?: string;
  remoteIp?: string;
}

const lower = (value: string): string => value.trim().toLowerCase();

/** Parses the first rule block of `netsh advfirewall firewall show rule name=... verbose`. Tolerant of spacing; English labels only. */
export function parseRuleOutput(stdout: string): InspectedRule {
  const fields = new Map<string, string>();
  for (const line of stdout.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z][A-Za-z ]*?)\s*:\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const key = lower(match[1]!);
    if (key === 'rule name' && fields.has('rule name')) break; // only the first block
    if (!fields.has(key)) fields.set(key, match[2]!);
  }
  const name = fields.get('rule name');
  const direction = fields.get('direction');
  const action = fields.get('action');
  const localPort = fields.get('localport');
  if (name === undefined || direction === undefined || action === undefined || localPort === undefined) return { present: true, parsed: false };
  const rawProfiles = (fields.get('profiles') ?? '').split(',').map(lower).filter((p) => p.length > 0);
  const profiles = rawProfiles.some((p) => p === 'any' || p === 'all') ? [...ALL_PROFILES] : rawProfiles;
  const enabled = lower(fields.get('enabled') ?? '');
  return {
    present: true,
    parsed: true,
    name,
    enabled: enabled === 'yes' || enabled === 'true',
    direction: lower(direction) === 'out' ? 'out' : 'in',
    profiles,
    protocol: fields.get('protocol') ?? '',
    localPort,
    action: lower(action) === 'block' ? 'block' : 'allow',
    program: fields.get('program') ?? '',
    remoteIp: fields.get('remoteip') ?? '',
  };
}

/** Reads one named rule. Rejects only when `netsh` cannot be spawned. */
export async function inspectRule(exec: ExecFn, name: string): Promise<InspectedRule> {
  const result = await netsh(exec, 'show', 'rule', `name=${name}`, 'verbose');
  if (result.code !== 0) return { present: false, parsed: false };
  return parseRuleOutput(result.stdout);
}

export interface ExpectedRule {
  port: number;
  /** Full path of `dude-hub.exe`. */
  program?: string;
  /** Lower-case profiles the rule must cover (default: all three). */
  profiles?: readonly string[];
  /** The rule must not restrict the remote address. */
  remoteAny?: boolean;
}

const normalizePath = (value: string): string => value.trim().replace(/\//g, '\\').toLowerCase();

function coversPort(spec: string, port: number): boolean {
  return spec.split(',').some((part) => {
    const item = part.trim();
    const range = /^(\d+)-(\d+)$/.exec(item);
    if (range) return port >= Number(range[1]) && port <= Number(range[2]);
    return item === String(port);
  });
}

/** Human-readable problems with an inspected rule; empty when it matches the expectation. */
export function validateRule(rule: InspectedRule, expected: ExpectedRule): string[] {
  if (!rule.present) return ['The rule does not exist.'];
  if (!rule.parsed) return ['The rule exists but its details could not be read (unrecognized netsh output).'];
  const problems: string[] = [];
  if (rule.enabled === false) problems.push('The rule is disabled.');
  if (rule.direction === 'out') problems.push('The rule is an outbound rule; an inbound rule is required.');
  if (rule.action === 'block') problems.push('The rule blocks traffic instead of allowing it.');
  const protocol = lower(rule.protocol ?? '');
  if (protocol !== 'tcp' && protocol !== 'any' && protocol !== '6') problems.push(`The rule applies to protocol ${rule.protocol || 'unknown'}, not TCP.`);
  if (!coversPort(rule.localPort ?? '', expected.port)) problems.push(`The rule allows local port ${rule.localPort || 'unknown'}, not ${expected.port}.`);
  if (expected.program !== undefined) {
    const actual = rule.program ?? '';
    if (normalizePath(actual) !== normalizePath(expected.program)) problems.push(`The rule is scoped to program "${actual || 'any'}", not "${expected.program}".`);
  }
  const have = new Set(rule.profiles ?? []);
  const missing = (expected.profiles ?? ALL_PROFILES).filter((p) => !have.has(p));
  if (missing.length > 0) problems.push(`The rule covers profile(s) ${[...have].join(', ') || 'none'}; it must also cover ${missing.join(', ')}.`);
  if (expected.remoteAny === true && lower(rule.remoteIp ?? '') !== 'any') problems.push(`The rule is restricted to remote address ${rule.remoteIp || 'unknown'}; public mode expects any.`);
  return problems;
}

export interface FirewallFact { present: boolean; problems: string[] }

/** Inspects and validates the Public rule for the diagnostics checklist. Null when `netsh` cannot be run. */
export async function gatherPublicFirewallFact(exec: ExecFn, port: number, installDir: string): Promise<FirewallFact | null> {
  try {
    const rule = await inspectRule(exec, PUBLIC_RULE_NAME);
    if (!rule.present) return { present: false, problems: [] };
    return { present: true, problems: validateRule(rule, { port, program: path.join(installDir, HUB_EXE), remoteAny: true }) };
  } catch {
    return null;
  }
}

export interface FirewallOptions {
  target: 'public' | 'acme';
  action: 'on' | 'off' | 'status';
  /** `public on` outside public mode. */
  force?: boolean;
  dataDir?: string;
  installDir?: string;
}

function readConfig(configFile: string): HubConfig {
  return existsSync(configFile) ? loadOrCreateHubConfig(configFile) : defaultHubConfig();
}

/** The ACME http-01 port: `exposure.acme.httpPort`, else 80. Never creates the config file. */
export function configuredAcmeHttpPort(configFile: string): number {
  try { return readConfig(configFile).exposure.acme?.httpPort ?? DEFAULT_ACME_HTTP_PORT; } catch { return DEFAULT_ACME_HTTP_PORT; }
}

/**
 * `dude-hub network firewall public|acme on|off|status`. Elevated when the Windows service is installed; a clear no-op off Windows.
 * Never touches the LAN rule. `off` is idempotent.
 */
export async function runFirewall(options: FirewallOptions, deps: ServiceDeps = {}): Promise<number> {
  const d = resolveDeps(deps);
  const ruleName = options.target === 'public' ? PUBLIC_RULE_NAME : ACME_RULE_NAME;
  if (d.platform !== 'win32') {
    if (options.action === 'status') d.out(json({ applicable: false, rule: ruleName, reason: 'Windows Firewall rules apply only on Windows.' }));
    else d.err('Not applicable: Windows Firewall rules are managed only on Windows. Nothing was changed.\n');
    return EXIT_OK;
  }
  const state = await serviceState(d);
  if (state !== 'not-installed' && state !== 'unknown') {
    const refused = await requireElevated(d, 'Managing the Hub firewall rules');
    if (refused !== null) return refused;
  }
  let dataRoot: string;
  try {
    dataRoot = serviceDataDir(options.dataDir, d);
  } catch (error) {
    d.err(`${(error as Error).message}\n`);
    return EXIT_USAGE;
  }
  const configFile = hubPaths(dataRoot).configFile;
  let config: HubConfig;
  try {
    config = readConfig(configFile);
  } catch (error) {
    d.err(`${(error as Error).message}\n`);
    return EXIT_FAILURE;
  }
  const installDir = path.resolve(options.installDir ?? defaultInstallDir(d.env));
  const port = options.target === 'public' ? config.port : config.exposure.acme?.httpPort ?? DEFAULT_ACME_HTTP_PORT;

  try {
    if (options.action === 'status') {
      const inspected = await inspectRule(d.exec, ruleName);
      d.out(json({
        applicable: true,
        rule: ruleName,
        expected: { port, program: path.join(installDir, HUB_EXE), profile: 'any', remoteip: 'any' },
        inspected,
        problems: inspected.present ? validateRule(inspected, { port, program: path.join(installDir, HUB_EXE), remoteAny: true }) : [],
        exposureMode: config.exposure.mode,
      }));
      return EXIT_OK;
    }
    if (options.action === 'off') {
      const existed = (await inspectRule(d.exec, ruleName)).present;
      if (existed) {
        const removed = await (options.target === 'public' ? deletePublicRule(d.exec) : deleteAcmeRule(d.exec));
        if (removed.code !== 0 && (await inspectRule(d.exec, ruleName)).present) {
          d.err(`The firewall rule "${ruleName}" could not be removed: ${(removed.stderr || removed.stdout).trim()}\n`);
          return EXIT_FAILURE;
        }
      }
      d.out(json({ rule: ruleName, present: false, removed: existed }));
      return EXIT_OK;
    }
    if (options.target === 'public' && config.exposure.mode !== 'public' && options.force !== true) {
      d.err(`The "${PUBLIC_RULE_NAME}" rule opens the Hub port to every network and is meant for public mode only; this Hub's exposure mode is "${config.exposure.mode}". ` +
        'Switch the mode first, or pass --force to add it anyway. LAN mode uses "dude-hub network lan on" (Private profile only).\n');
      return EXIT_USAGE;
    }
    const added = await (options.target === 'public' ? addPublicRule(d.exec, port, installDir) : addAcmeRule(d.exec, port, installDir));
    if (added.code !== 0) {
      d.err(`The firewall rule "${ruleName}" could not be added: ${(added.stderr || added.stdout).trim()}\n`);
      return EXIT_FAILURE;
    }
    if (options.target === 'acme') d.err('Remove it as soon as the certificate order finishes: "dude-hub network firewall acme off" (or let "tls acme issue --open-firewall" manage it).\n');
    d.out(json({ rule: ruleName, present: true, port, program: path.join(installDir, HUB_EXE), profile: 'any' }));
    return EXIT_OK;
  } catch (error) {
    d.err(`${(error as Error).message}\n`);
    return EXIT_FAILURE;
  }
}
