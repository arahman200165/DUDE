import type { HubBindMode } from '../config/hub-config.js';

export type ParsedCommand =
  | { command: 'run'; dataDir?: string; port?: number; bind?: HubBindMode; webRoot?: string }
  | { command: 'version' }
  | { command: 'help' };

const BIND_MODES: readonly string[] = ['loopback', 'lan', 'container'];

export class UsageError extends Error {}

export const HELP_TEXT = `DUDE Hub

Usage:
  dude-hub run [--data-dir <dir>] [--port <n>] [--bind loopback|lan|container] [--web-root <dir>]
  dude-hub version
  dude-hub help

Flags override the saved configuration for this run only.
The data directory may also be set with DUDE_HUB_DATA_DIR; the log level with DUDE_HUB_LOG_LEVEL.
`;

/** Hand-rolled argv parsing (no CLI library). `argv` excludes the node binary and script path. */
export function parseArgs(argv: readonly string[]): ParsedCommand {
  const [command, ...rest] = argv;
  if (command === undefined || command === 'help' || command === '--help' || command === '-h') return { command: 'help' };
  if (command === 'version' || command === '--version') return { command: 'version' };
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
