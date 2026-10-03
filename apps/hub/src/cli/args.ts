import type { HubBindMode } from '../config/hub-config.js';

export type ParsedCommand =
  | { command: 'run'; dataDir?: string; port?: number; bind?: HubBindMode; webRoot?: string }
  | { command: 'status'; dataDir?: string }
  | { command: 'setup-token'; dataDir?: string; deliverTo?: string; nonce?: string }
  | { command: 'owner-reset'; dataDir?: string; confirm?: string }
  | { command: 'tls'; action: 'status' | 'rotate' | 'activate'; dataDir?: string; restage?: boolean; force?: boolean; confirm?: string }
  | { command: 'tls-names'; action: 'list' | 'add' | 'remove'; name?: string; dataDir?: string; installDir?: string }
  | { command: 'service'; action: 'install' | 'uninstall' | 'start' | 'stop' | 'restart' | 'status' | 'update'; dataDir?: string; installDir?: string; port?: number; lan?: boolean; source?: string; keepData?: boolean }
  | { command: 'network'; action: 'lan-on' | 'lan-off' | 'status'; dataDir?: string; installDir?: string }
  | { command: 'doctor'; dataDir?: string; installDir?: string }
  | { command: 'purge'; dataDir?: string; includeBackups?: boolean; confirm?: string; type?: string }
  | { command: 'version' }
  | { command: 'help' };

const BIND_MODES: readonly string[] = ['loopback', 'lan', 'container'];

export class UsageError extends Error {}

export const HELP_TEXT = `DUDE Hub

Usage:
  dude-hub run [--data-dir <dir>] [--port <n>] [--bind loopback|lan|container] [--web-root <dir>]
  dude-hub status [--data-dir <dir>]
  dude-hub setup-token [--data-dir <dir>] [--deliver-to <SID> --nonce <n>]
  dude-hub owner reset [--data-dir <dir>] [--confirm <token>]
  dude-hub tls status [--data-dir <dir>]
  dude-hub tls rotate [--restage] [--data-dir <dir>]
  dude-hub tls activate [--force] [--confirm <token>] [--data-dir <dir>]
  dude-hub tls names list [--data-dir <dir>]
  dude-hub tls names add <name> [--data-dir <dir>] [--install-dir <dir>]   (stages a re-issued certificate)
  dude-hub tls names remove <name> [--data-dir <dir>] [--install-dir <dir>]
  dude-hub service install [--install-dir <dir>] [--data-dir <dir>] [--port <n>] [--lan]   (elevated, Windows)
  dude-hub service uninstall [--keep-data] [--install-dir <dir>] [--data-dir <dir>]
  dude-hub service start|stop|restart|status [--install-dir <dir>] [--data-dir <dir>]
  dude-hub service update --source <staged dir> [--install-dir <dir>] [--data-dir <dir>]
  dude-hub network lan on|off|status [--data-dir <dir>] [--install-dir <dir>]
  dude-hub doctor [--data-dir <dir>] [--install-dir <dir>]
  dude-hub purge --data-dir <dir> [--include-backups] [--confirm <token> --type "DELETE HUB DATA"]
  dude-hub version
  dude-hub help

Flags override the saved configuration for this run only.
The data directory may also be set with DUDE_HUB_DATA_DIR; the log level with DUDE_HUB_LOG_LEVEL.
`;

/** Parses `--flag value` / `--flag=value` pairs and bare boolean flags against an allow-list. */
function parseFlags(flags: readonly string[], allowed: readonly string[], booleans: readonly string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < flags.length; i++) {
    const flag = flags[i]!;
    const eq = flag.startsWith('--') ? flag.indexOf('=') : -1;
    const name = eq >= 0 ? flag.slice(0, eq) : flag;
    if (!allowed.includes(name)) throw new UsageError(`Unknown flag "${flag}". Run "dude-hub help".`);
    if (booleans.includes(name)) {
      if (eq >= 0) throw new UsageError(`Flag ${name} takes no value.`);
      result[name] = 'true';
      continue;
    }
    const next = eq >= 0 ? flag.slice(eq + 1) : flags[++i];
    if (next === undefined || (eq < 0 && next.startsWith('--'))) throw new UsageError(`Flag ${name} needs a value.`);
    result[name] = next;
  }
  return result;
}

const optional = (values: Record<string, string>, flag: string, key: string): Record<string, string> => (values[flag] !== undefined ? { [key]: values[flag] } : {});

/** Hand-rolled argv parsing (no CLI library). `argv` excludes the node binary and script path. */
export function parseArgs(argv: readonly string[]): ParsedCommand {
  const [command, ...rest] = argv;
  if (command === undefined || command === 'help' || command === '--help' || command === '-h') return { command: 'help' };
  if (command === 'version' || command === '--version') return { command: 'version' };
  if (command === 'status') {
    const status: Extract<ParsedCommand, { command: 'status' }> = { command: 'status' };
    for (let i = 0; i < rest.length; i++) {
      const flag = rest[i]!;
      if (flag === '--data-dir') {
        const next = rest[++i];
        if (next === undefined || next.startsWith('--')) throw new UsageError('Flag --data-dir needs a value.');
        status.dataDir = next;
      } else if (flag.startsWith('--data-dir=')) status.dataDir = flag.slice('--data-dir='.length);
      else throw new UsageError(`Unknown flag "${flag}". Run "dude-hub help".`);
    }
    return status;
  }
  if (command === 'owner') {
    if (rest[0] !== 'reset') throw new UsageError('Usage: dude-hub owner reset [--data-dir <dir>] [--confirm <token>].');
    const result: Extract<ParsedCommand, { command: 'owner-reset' }> = { command: 'owner-reset' };
    const flags = rest.slice(1);
    for (let i = 0; i < flags.length; i++) {
      const flag = flags[i]!;
      const eq = flag.startsWith('--') ? flag.indexOf('=') : -1;
      const name = eq >= 0 ? flag.slice(0, eq) : flag;
      const inline = eq >= 0 ? flag.slice(eq + 1) : undefined;
      if (name !== '--data-dir' && name !== '--confirm') throw new UsageError(`Unknown flag "${flag}". Run "dude-hub help".`);
      const next = inline ?? flags[++i];
      if (next === undefined || (inline === undefined && next.startsWith('--'))) throw new UsageError(`Flag ${name} needs a value.`);
      if (name === '--data-dir') result.dataDir = next;
      else result.confirm = next;
    }
    return result;
  }
  if (command === 'tls' && rest[0] === 'names') {
    const action = rest[1];
    if (action !== 'list' && action !== 'add' && action !== 'remove') throw new UsageError('Usage: dude-hub tls names list|add <name>|remove <name>.');
    let name: string | undefined;
    let flags = rest.slice(2);
    if (action !== 'list') {
      name = flags[0];
      if (name === undefined || name.startsWith('--')) throw new UsageError(`Usage: dude-hub tls names ${action} <name>.`);
      flags = flags.slice(1);
    }
    const values = parseFlags(flags, ['--data-dir', '--install-dir'], []);
    return { command: 'tls-names', action, ...(name !== undefined ? { name } : {}), ...optional(values, '--data-dir', 'dataDir'), ...optional(values, '--install-dir', 'installDir') };
  }
  if (command === 'tls') {
    const action = rest[0];
    if (action !== 'status' && action !== 'rotate' && action !== 'activate') throw new UsageError('Usage: dude-hub tls status|rotate|activate. Run "dude-hub help".');
    const result: Extract<ParsedCommand, { command: 'tls' }> = { command: 'tls', action };
    const flags = rest.slice(1);
    for (let i = 0; i < flags.length; i++) {
      const flag = flags[i]!;
      const eq = flag.startsWith('--') ? flag.indexOf('=') : -1;
      const name = eq >= 0 ? flag.slice(0, eq) : flag;
      const inline = eq >= 0 ? flag.slice(eq + 1) : undefined;
      if (name === '--restage' && action === 'rotate' && inline === undefined) { result.restage = true; continue; }
      if (name === '--force' && action === 'activate' && inline === undefined) { result.force = true; continue; }
      if (name !== '--data-dir' && !(name === '--confirm' && action === 'activate')) throw new UsageError(`Unknown flag "${flag}". Run "dude-hub help".`);
      const next = inline ?? flags[++i];
      if (next === undefined || (inline === undefined && next.startsWith('--'))) throw new UsageError(`Flag ${name} needs a value.`);
      if (name === '--data-dir') result.dataDir = next;
      else result.confirm = next;
    }
    return result;
  }
  if (command === 'service') {
    const actions = ['install', 'uninstall', 'start', 'stop', 'restart', 'status', 'update'] as const;
    const action = actions.find((a) => a === rest[0]);
    if (action === undefined) throw new UsageError('Usage: dude-hub service install|uninstall|start|stop|restart|status|update. Run "dude-hub help".');
    const allowed: Record<string, string[]> = {
      install: ['--install-dir', '--data-dir', '--port', '--lan'],
      uninstall: ['--install-dir', '--data-dir', '--keep-data'],
      update: ['--install-dir', '--data-dir', '--source'],
    };
    const values = parseFlags(rest.slice(1), allowed[action] ?? ['--install-dir', '--data-dir'], ['--lan', '--keep-data']);
    const result: Extract<ParsedCommand, { command: 'service' }> = { command: 'service', action, ...optional(values, '--install-dir', 'installDir'), ...optional(values, '--data-dir', 'dataDir'), ...optional(values, '--source', 'source') };
    if (values['--lan'] !== undefined) result.lan = true;
    if (values['--keep-data'] !== undefined) result.keepData = true;
    if (values['--port'] !== undefined) {
      const port = Number(values['--port']);
      if (!/^[0-9]+$/.test(values['--port']) || port < 1 || port > 65535) throw new UsageError('--port must be an integer from 1 to 65535.');
      result.port = port;
    }
    return result;
  }
  if (command === 'network') {
    const [group, mode, ...flags] = rest;
    const dirs = (values: Record<string, string>) => ({ ...optional(values, '--data-dir', 'dataDir'), ...optional(values, '--install-dir', 'installDir') });
    if (group === 'lan' && (mode === 'on' || mode === 'off' || mode === 'status')) {
      return { command: 'network', action: mode === 'on' ? 'lan-on' : mode === 'off' ? 'lan-off' : 'status', ...dirs(parseFlags(flags, ['--install-dir', '--data-dir'], [])) };
    }
    if (group === 'status') {
      return { command: 'network', action: 'status', ...dirs(parseFlags(mode === undefined ? [] : [mode, ...flags], ['--install-dir', '--data-dir'], [])) };
    }
    throw new UsageError('Usage: dude-hub network lan on|off|status [--data-dir <dir>].');
  }
  if (command === 'doctor') {
    const values = parseFlags(rest, ['--install-dir', '--data-dir'], []);
    return { command: 'doctor', ...optional(values, '--data-dir', 'dataDir'), ...optional(values, '--install-dir', 'installDir') };
  }
  if (command === 'purge') {
    const values = parseFlags(rest, ['--data-dir', '--include-backups', '--confirm', '--type'], ['--include-backups']);
    return {
      command: 'purge',
      ...optional(values, '--data-dir', 'dataDir'),
      ...(values['--include-backups'] !== undefined ? { includeBackups: true } : {}),
      ...optional(values, '--confirm', 'confirm'),
      ...optional(values, '--type', 'type'),
    };
  }
  if (command === 'setup-token') {
    const result: Extract<ParsedCommand, { command: 'setup-token' }> = { command: 'setup-token' };
    for (let i = 0; i < rest.length; i++) {
      const flag = rest[i]!;
      const eq = flag.startsWith('--') ? flag.indexOf('=') : -1;
      const name = eq >= 0 ? flag.slice(0, eq) : flag;
      const inline = eq >= 0 ? flag.slice(eq + 1) : undefined;
      if (name !== '--data-dir' && name !== '--deliver-to' && name !== '--nonce') throw new UsageError(`Unknown flag "${flag}". Run "dude-hub help".`);
      const next = inline ?? rest[++i];
      if (next === undefined || (inline === undefined && next.startsWith('--'))) throw new UsageError(`Flag ${name} needs a value.`);
      if (name === '--data-dir') result.dataDir = next;
      else if (name === '--deliver-to') result.deliverTo = next;
      else result.nonce = next;
    }
    return result;
  }
  if (command !== 'run') throw new UsageError(`Unknown command "${command}". Run "dude-hub help".`);

  const result: Extract<ParsedCommand, { command: 'run' }> = { command: 'run' };
  for (let i = 0; i < rest.length; i++) {
    const flag = rest[i]!;
    const eq = flag.startsWith('--') ? flag.indexOf('=') : -1;
    const name = eq >= 0 ? flag.slice(0, eq) : flag;
    const inline = eq >= 0 ? flag.slice(eq + 1) : undefined;
    const value = (): string => {
      const next = inline ?? rest[++i];
      if (next === undefined || (inline === undefined && next.startsWith('--'))) throw new UsageError(`Flag ${name} needs a value.`);
      return next;
    };
    switch (name) {
      case '--data-dir': result.dataDir = value(); break;
      case '--web-root': result.webRoot = value(); break;
      case '--port': {
        const text = value();
        const port = Number(text);
        if (!/^\d+$/.test(text) || port > 65535) throw new UsageError('--port must be an integer from 0 to 65535.');
        result.port = port;
        break;
      }
      case '--bind': {
        const mode = value();
        if (!BIND_MODES.includes(mode)) throw new UsageError('--bind must be loopback, lan or container.');
        result.bind = mode as HubBindMode;
        break;
      }
      default: throw new UsageError(`Unknown flag "${flag}". Run "dude-hub help".`);
    }
  }
  return result;
}
