import path from 'node:path';
import { BACKUP_INTERVAL_HOURS_MAX, BACKUP_RETENTION_MAX } from '../config/hub-config.js';
import type { HubBindMode } from '../config/hub-config.js';

export type ParsedCommand =
  | { command: 'run'; dataDir?: string; port?: number; bind?: HubBindMode; webRoot?: string }
  | { command: 'status'; dataDir?: string }
  | { command: 'setup-token'; dataDir?: string; deliverTo?: string; nonce?: string }
  | { command: 'owner-reset'; dataDir?: string; confirm?: string }
  | { command: 'tls'; action: 'status' | 'rotate' | 'activate'; dataDir?: string; restage?: boolean; force?: boolean; confirm?: string }
  | { command: 'tls-ca'; action: 'init' | 'status' | 'export'; suffixes?: string[]; out?: string; dataDir?: string; installDir?: string }
  | { command: 'tls-import'; cert: string; key: string; chain?: string; dataDir?: string; installDir?: string }
  | { command: 'tls-acme'; action: 'issue' | 'status'; names?: string[]; email?: string; agreeTos?: boolean; staging?: boolean; directory?: string; httpPort?: number; openFirewall?: boolean; dataDir?: string; installDir?: string }
  | { command: 'tls-proxy-pin'; action: 'add' | 'remove' | 'list' | 'activate'; value?: string; force?: boolean; confirm?: string; dataDir?: string; installDir?: string }
  | { command: 'security-blocks'; action: 'list' | 'clear'; ip?: string; dataDir?: string; installDir?: string }
  | { command: 'security-audit-ips'; mode?: 'full' | 'truncated'; dataDir?: string; installDir?: string }
  | { command: 'tls-names'; action: 'list' | 'add' | 'remove'; name?: string; dataDir?: string; installDir?: string }
  | { command: 'service'; action: 'install' | 'uninstall' | 'start' | 'stop' | 'restart' | 'status' | 'update'; dataDir?: string; installDir?: string; port?: number; lan?: boolean; source?: string; keepData?: boolean }
  | { command: 'network'; action: 'lan-on' | 'lan-off' | 'status' | 'proxy-on' | 'proxy-off' | 'proxy-status' | 'mode-private' | 'mode-public'; trusted?: string[]; publicOrigin?: string; acceptUnverifiedReachability?: boolean; type?: string; dataDir?: string; installDir?: string }
  | { command: 'network-tunnel'; action: 'on' | 'off' | 'status'; hostname?: string; confirm?: string; type?: string; tokenStdin?: boolean; acceptUnverifiedReachability?: boolean; forgetToken?: boolean; dataDir?: string; installDir?: string }
  | { command: 'network-firewall'; target: 'public' | 'acme'; action: 'on' | 'off' | 'status'; force?: boolean; dataDir?: string; installDir?: string }
  | { command: 'doctor'; json?: boolean; dataDir?: string; installDir?: string }
  | { command: 'provision'; action: 'run' | 'status'; json?: boolean; dataDir?: string; installDir?: string }
  | { command: 'purge'; dataDir?: string; includeBackups?: boolean; confirm?: string; type?: string }
  | { command: 'backup'; action: BackupCliAction; folder?: string; file?: string; confirm?: string; forTransfer?: boolean; everyHours?: number; keep?: number; destination?: string; label?: string; backupId?: string; kind?: 'local-folder' | 's3'; endpoint?: string; region?: string; bucket?: string; prefix?: string; forcePathStyle?: boolean; allowPrivateNetwork?: boolean; credentialsStdin?: boolean; dataDir?: string; installDir?: string }
  | { command: 'backup-restore'; file?: string; folder?: string; backupId?: string; confirm?: string; replace?: string; oldHubGone?: string; dataDir?: string; installDir?: string }
  | { command: 'version' }
  | { command: 'help' };

export type BackupCliAction =
  | 'create' | 'list' | 'verify' | 'schedule-set' | 'schedule-off' | 'schedule-status' | 'reactivate'
  | 'run' | 'prune' | 'rewrap' | 'destination-add' | 'destination-list' | 'destination-remove' | 'destination-verify' | 'destination-probe';

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
  dude-hub tls ca init [--suffix <dns>]... [--data-dir <dir>] [--install-dir <dir>]   (built-in local CA; stages a CA-issued certificate)
  dude-hub tls ca status [--data-dir <dir>]
  dude-hub tls ca export [--out <file.cer>] [--data-dir <dir>]
  dude-hub tls import --cert <pem> --key <pem> [--chain <pem>] [--data-dir <dir>] [--install-dir <dir>]   (validates and stages an operator certificate)
  dude-hub tls acme issue --name <dns> [--name <dns>]... [--email <e>] [--agree-tos] [--staging | --directory <https-url>] [--http-port <n>] [--open-firewall] [--data-dir <dir>] [--install-dir <dir>]   (orders a certificate over ACME http-01 and stages it; port 80 must be reachable from the Internet for the CA; --open-firewall adds the ACME firewall rule for the order and always removes it, elevated)
  dude-hub tls acme status [--data-dir <dir>]
  dude-hub tls proxy-pin add <pem-or-spki> [--data-dir <dir>] [--install-dir <dir>]   (reverse proxy: stages the proxy's leaf pin)
  dude-hub tls proxy-pin activate [--force] [--confirm <token>] [--data-dir <dir>]
  dude-hub tls proxy-pin remove <spki> [--confirm <token>] [--data-dir <dir>]
  dude-hub tls proxy-pin list [--data-dir <dir>]
  dude-hub tls names list [--data-dir <dir>]
  dude-hub tls names add <name> [--data-dir <dir>] [--install-dir <dir>]   (stages a re-issued certificate)
  dude-hub tls names remove <name> [--data-dir <dir>] [--install-dir <dir>]
  dude-hub security blocks list [--data-dir <dir>] [--install-dir <dir>]   (addresses blocked after repeated failures; elevated, Hub running)
  dude-hub security blocks clear <address> [--data-dir <dir>] [--install-dir <dir>]
  dude-hub security audit-ips [full|truncated] [--data-dir <dir>] [--install-dir <dir>]   (show or set address privacy for NEW audit rows and sessions; existing rows are not rewritten; elevated, Hub running)
  dude-hub service install [--install-dir <dir>] [--data-dir <dir>] [--port <n>] [--lan]   (elevated, Windows)
  dude-hub service uninstall [--keep-data] [--install-dir <dir>] [--data-dir <dir>]
  dude-hub service start|stop|restart|status [--install-dir <dir>] [--data-dir <dir>]
  dude-hub service update --source <staged dir> [--install-dir <dir>] [--data-dir <dir>]
  dude-hub network lan on|off|status [--data-dir <dir>] [--install-dir <dir>]
  dude-hub network status [--data-dir <dir>] [--install-dir <dir>]   (bind, exposure mode, names, proxy, HSTS)
  dude-hub network firewall public on|off|status [--force] [--data-dir <dir>] [--install-dir <dir>]   (the "DUDE Hub (Public)" inbound rule for public mode, every profile; on needs public mode or --force; elevated)
  dude-hub network firewall acme on|off|status [--data-dir <dir>] [--install-dir <dir>]   (the temporary "DUDE Hub (ACME http-01)" rule; normally managed by tls acme issue --open-firewall)
  dude-hub network tunnel on [--hostname <your-domain>] [--accept-unverified-reachability] [--confirm <token> --type "EXPOSE HUB THROUGH CLOUDFLARE" [--token-stdin]] [--data-dir <dir>] [--install-dir <dir>]   (managed Cloudflare Tunnel; elevated, Hub running; without --confirm it only previews and issues a 60-second token; the connector token is read from standard input, never an argument)
  dude-hub network tunnel off [--forget-token] [--confirm <token>] [--data-dir <dir>] [--install-dir <dir>]   (stops the connector and removes the tunnel and its proxy configuration)
  dude-hub network tunnel status [--data-dir <dir>] [--install-dir <dir>]
  dude-hub network proxy on --trusted <cidr>[,<cidr>...] --public-origin https://<name>[:<port>] [--data-dir <dir>] [--install-dir <dir>]
  dude-hub network proxy off|status [--data-dir <dir>] [--install-dir <dir>]
  dude-hub network mode private [--data-dir <dir>] [--install-dir <dir>]
  dude-hub network mode public [--accept-unverified-reachability] [--type "EXPOSE HUB TO THE INTERNET"] [--data-dir <dir>] [--install-dir <dir>]   (elevated; the running Hub must pass the readiness gate; without --type only the readiness report is printed)
  dude-hub doctor [--json] [--data-dir <dir>] [--install-dir <dir>]   (readiness checklist; --json prints the endpoint diagnostics report)
  dude-hub provision [--json] [--data-dir <dir>] [--install-dir <dir>]   (creates and checks the SaveSphere storage components; additive and safe to re-run; elevated, Hub running; exit 0 = ready or degraded, 1 = needs attention or provisioning, 2 = usage or Hub not running)
  dude-hub provision status [--json] [--data-dir <dir>] [--install-dir <dir>]   (read-only per-component status)
  dude-hub purge --data-dir <dir> [--include-backups] [--confirm <token> --type "DELETE HUB DATA"]
  dude-hub backup create [--for-transfer] [--folder <abs dir>] [--data-dir <dir>] [--install-dir <dir>] [--confirm <token>]   (two steps: the preview prints a one-time token, --confirm asks for the passphrase and writes the encrypted backup; --for-transfer then RETIRES this Hub until "backup reactivate"; elevated, Hub running)
  dude-hub backup reactivate [--data-dir <dir>] [--install-dir <dir>] [--confirm <token>]   (two steps: returns a retired (transferred) Hub to service with a new authority epoch; elevated, Hub running)
  dude-hub backup restore --file <abs path> | --folder <abs repository dir> [--backup <backup id>] [--data-dir <dir>] [--install-dir <dir>] [--confirm <token>] [--replace "REPLACE HUB DATA"] [--old-hub-gone "THE OLD HUB IS GONE"]   (OFFLINE, Hub stopped; two steps: the preview decrypts the backup and prints a one-time token, --confirm restores the databases and every blob with a new Hub identity; every device must be paired again; elevated when the service is installed)
  dude-hub backup list [--folder <abs dir>] [--data-dir <dir>] [--install-dir <dir>]
  dude-hub backup verify --file <abs path> [--data-dir <dir>] [--install-dir <dir>]   (decrypts a .dudebackup file with its passphrase, checks it end to end and prints what it contains; elevated)
  dude-hub backup destination add --folder <abs dir> [--label <text>] [--data-dir <dir>] [--install-dir <dir>]   (a backup v2 repository folder; asks for the passphrase; the Hub keeps a protected master key, never the passphrase; elevated)
  dude-hub backup destination add --kind s3 --endpoint <https url> --region <region> --bucket <bucket> [--prefix <key prefix>] [--force-path-style | --virtual-hosted] [--allow-private-network] [--label <text>] --credentials-stdin   (an S3-compatible bucket: AWS S3, Cloudflare R2, Backblaze B2, MinIO; the credentials are a JSON document on standard input, {"accessKeyId","secretAccessKey","sessionToken"?,"passphrase"?}, never an argument; the passphrase comes from DUDE_HUB_BACKUP_PASSPHRASE or that document; elevated)
  dude-hub backup destination probe --id <id>   (writes, reads, overwrites conditionally and deletes a tiny object and a tiny multipart upload at the destination and reports what the provider supports; elevated)
  dude-hub backup destination list [--data-dir <dir>] [--install-dir <dir>]
  dude-hub backup destination remove --id <id> [--confirm <token>] [--data-dir <dir>] [--install-dir <dir>]   (two steps; forgets the destination, never deletes its backups; elevated)
  dude-hub backup destination verify --id <id> [--backup <backup id>] [--data-dir <dir>] [--install-dir <dir>]   (decrypts and checks a whole backup at the destination; elevated)
  dude-hub backup run [--destination <id>] [--data-dir <dir>] [--install-dir <dir>]   (a backup v2 into every destination now; verified on write; elevated)
  dude-hub backup prune --destination <id> [--confirm <token>] [--data-dir <dir>] [--install-dir <dir>]   (two steps: keeps 7 daily, 4 weekly and 6 monthly backups and deletes the rest and their unreferenced packs; elevated)
  dude-hub backup rewrap [--confirm <token>] [--data-dir <dir>] [--install-dir <dir>]   (two steps: a new passphrase for every destination; asks for it at --confirm; elevated)
  dude-hub backup schedule set --every-hours <n> [--folder <abs dir>] [--data-dir <dir>] [--install-dir <dir>]   (unattended backups into every destination; --folder adds it as a destination first and asks for the passphrase; elevated)
  dude-hub backup schedule off|status [--data-dir <dir>] [--install-dir <dir>]
  dude-hub version
  dude-hub help

Flags override the saved configuration for this run only.
The data directory may also be set with DUDE_HUB_DATA_DIR; the log level with DUDE_HUB_LOG_LEVEL.
The backup passphrase is never a flag: it comes from DUDE_HUB_BACKUP_PASSPHRASE, the first line of standard input, or a hidden prompt.
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

const BACKUP_USAGE = 'Usage: dude-hub backup create|reactivate|list|verify --file <path>|restore|run|prune|rewrap|destination add|list|remove|verify|schedule set|off|status. Run "dude-hub help".';

function absolutePath(values: Record<string, string>, flag: string): string | undefined {
  const value = values[flag];
  if (value === undefined) return undefined;
  if (value.length === 0 || !path.isAbsolute(value)) throw new UsageError(`Flag ${flag} must be an absolute path.`);
  return value;
}

function positiveInteger(values: Record<string, string>, flag: string, max: number): number {
  const text = values[flag];
  if (text === undefined) throw new UsageError(`Flag ${flag} is required.`);
  return checkedInteger(text, flag, max);
}

function checkedInteger(text: string, flag: string, max: number): number {
  const value = Number(text);
  if (!/^[0-9]{1,6}$/.test(text) || value < 1 || value > max) throw new UsageError(`Flag ${flag} must be an integer from 1 to ${max}.`);
  return value;
}

/** `backup ...`. The passphrase is never a flag (it is read from the environment, standard input or a hidden prompt). */
function parseBackup(rest: readonly string[]): ParsedCommand {
  let sub = rest[0];
  let flags = rest.slice(1);
  let action: BackupCliAction;
  if (sub === 'schedule') {
    sub = flags[0];
    flags = flags.slice(1);
    if (sub !== 'set' && sub !== 'off' && sub !== 'status') throw new UsageError('Usage: dude-hub backup schedule set --every-hours <n> [--folder <abs dir>] | off | status.');
    action = sub === 'set' ? 'schedule-set' : sub === 'off' ? 'schedule-off' : 'schedule-status';
  } else if (sub === 'destination') {
    sub = flags[0];
    flags = flags.slice(1);
    if (sub !== 'add' && sub !== 'list' && sub !== 'remove' && sub !== 'verify' && sub !== 'probe') throw new UsageError('Usage: dude-hub backup destination add --folder <abs dir> [--label <text>] | add --kind s3 ... --credentials-stdin | list | remove --id <id> | verify --id <id> [--backup <id>] | probe --id <id>.');
    action = `destination-${sub}`;
  } else if (sub === 'create' || sub === 'list' || sub === 'verify' || sub === 'reactivate' || sub === 'run' || sub === 'prune' || sub === 'rewrap') {
    action = sub;
  } else if (sub === 'restore') {
    return parseBackupRestore(flags);
  } else {
    throw new UsageError(BACKUP_USAGE);
  }
  if (flags.some((flag) => flag === '--passphrase' || flag.startsWith('--passphrase='))) {
    throw new UsageError('The backup passphrase is never accepted as a flag. Set DUDE_HUB_BACKUP_PASSPHRASE, pipe it on standard input, or type it at the prompt.');
  }
  const allowed: Record<BackupCliAction, string[]> = {
    create: ['--folder', '--confirm', '--for-transfer'],
    reactivate: ['--confirm'],
    list: ['--folder'],
    verify: ['--file'],
    'schedule-set': ['--folder', '--every-hours', '--keep'],
    'schedule-off': [],
    'schedule-status': [],
    run: ['--destination'],
    prune: ['--destination', '--confirm'],
    rewrap: ['--confirm'],
    'destination-add': ['--folder', '--label', '--kind', '--endpoint', '--region', '--bucket', '--prefix', '--force-path-style', '--virtual-hosted', '--allow-private-network', '--credentials-stdin'],
    'destination-list': [],
    'destination-remove': ['--id', '--confirm'],
    'destination-verify': ['--id', '--backup'],
    'destination-probe': ['--id'],
  };
  const values = parseFlags(flags, [...allowed[action], '--data-dir', '--install-dir'], ['--for-transfer', '--force-path-style', '--virtual-hosted', '--allow-private-network', '--credentials-stdin']);
  const folder = absolutePath(values, '--folder');
  const file = absolutePath(values, '--file');
  const forTransfer = values['--for-transfer'] !== undefined;
  const common = { ...optional(values, '--data-dir', 'dataDir'), ...optional(values, '--install-dir', 'installDir') };
  if (action === 'verify' && file === undefined) throw new UsageError('Usage: dude-hub backup verify --file <absolute path to a .dudebackup file>.');
  if (action === 'schedule-set') {
    const everyHours = positiveInteger(values, '--every-hours', BACKUP_INTERVAL_HOURS_MAX);
    const keep = values['--keep'] === undefined ? undefined : checkedInteger(values['--keep'], '--keep', BACKUP_RETENTION_MAX);
    return { command: 'backup', action, everyHours, ...(folder !== undefined ? { folder } : {}), ...(keep !== undefined ? { keep } : {}), ...common };
  }
  if (action === 'destination-add') {
    const kind = values['--kind'] ?? 'local-folder';
    if (kind !== 'local-folder' && kind !== 's3') throw new UsageError('Flag --kind must be local-folder or s3.');
    if (kind === 's3') {
      const s3Usage = 'Usage: dude-hub backup destination add --kind s3 --endpoint <https url> --region <region> --bucket <bucket> [--prefix <key prefix>] [--force-path-style | --virtual-hosted] [--allow-private-network] [--label <text>] --credentials-stdin.';
      if (values['--endpoint'] === undefined || values['--region'] === undefined || values['--bucket'] === undefined || values['--credentials-stdin'] === undefined) throw new UsageError(s3Usage);
      if (folder !== undefined) throw new UsageError('Flag --folder belongs to a local-folder destination, not --kind s3.');
      if (values['--force-path-style'] !== undefined && values['--virtual-hosted'] !== undefined) throw new UsageError('Use only one of --force-path-style and --virtual-hosted.');
      return {
        command: 'backup', action, kind: 's3', endpoint: values['--endpoint'], region: values['--region'], bucket: values['--bucket'], credentialsStdin: true,
        ...optional(values, '--prefix', 'prefix'), ...optional(values, '--label', 'label'),
        ...(values['--force-path-style'] !== undefined ? { forcePathStyle: true } : {}), ...(values['--virtual-hosted'] !== undefined ? { forcePathStyle: false } : {}),
        ...(values['--allow-private-network'] !== undefined ? { allowPrivateNetwork: true } : {}), ...common,
      };
    }
    for (const flag of ['--endpoint', '--region', '--bucket', '--prefix', '--force-path-style', '--virtual-hosted', '--allow-private-network', '--credentials-stdin']) {
      if (values[flag] !== undefined) throw new UsageError(`Flag ${flag} belongs to --kind s3.`);
    }
    if (folder === undefined) throw new UsageError('Usage: dude-hub backup destination add --folder <abs dir> [--label <text>].');
  }
  if ((action === 'destination-remove' || action === 'destination-verify' || action === 'destination-probe') && values['--id'] === undefined) throw new UsageError(`Usage: dude-hub backup destination ${action.slice('destination-'.length)} --id <id>.`);
  if (action === 'prune' && values['--destination'] === undefined) throw new UsageError('Usage: dude-hub backup prune --destination <id> [--confirm <token>].');
  return {
    command: 'backup', action,
    ...(folder !== undefined ? { folder } : {}), ...(file !== undefined ? { file } : {}), ...(forTransfer ? { forTransfer: true } : {}),
    ...optional(values, '--confirm', 'confirm'), ...optional(values, '--destination', 'destination'), ...optional(values, '--id', 'destination'),
    ...optional(values, '--label', 'label'), ...optional(values, '--backup', 'backupId'), ...common,
  };
}

/** `backup restore --file <abs> | --folder <abs> [--backup <id>] [--confirm <token>] [--replace <phrase>] [--old-hub-gone <phrase>]`: the typed phrases are validated by the command, not here. */
function parseBackupRestore(flags: readonly string[]): ParsedCommand {
  if (flags.some((flag) => flag === '--passphrase' || flag.startsWith('--passphrase='))) {
    throw new UsageError('The backup passphrase is never accepted as a flag. Set DUDE_HUB_BACKUP_PASSPHRASE, pipe it on standard input, or type it at the prompt.');
  }
  const values = parseFlags(flags, ['--file', '--folder', '--backup', '--confirm', '--replace', '--old-hub-gone', '--data-dir', '--install-dir'], []);
  const file = absolutePath(values, '--file');
  const folder = absolutePath(values, '--folder');
  const usage = 'Usage: dude-hub backup restore --file <absolute path to a .dudebackup file> | --folder <absolute repository folder> [--backup <backup id>] [--confirm <token>].';
  if ((file === undefined) === (folder === undefined)) throw new UsageError(usage);
  if (values['--backup'] !== undefined && folder === undefined) throw new UsageError(usage);
  return {
    command: 'backup-restore', ...(file !== undefined ? { file } : {}), ...(folder !== undefined ? { folder } : {}), ...optional(values, '--backup', 'backupId'),
    ...optional(values, '--confirm', 'confirm'), ...optional(values, '--replace', 'replace'), ...optional(values, '--old-hub-gone', 'oldHubGone'),
    ...optional(values, '--data-dir', 'dataDir'), ...optional(values, '--install-dir', 'installDir'),
  };
}

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
  if (command === 'tls' && rest[0] === 'ca') {
    const action = rest[1];
    if (action !== 'init' && action !== 'status' && action !== 'export') throw new UsageError('Usage: dude-hub tls ca init|status|export. Run "dude-hub help".');
    const suffixes: string[] = [];
    const flags: string[] = [];
    const tail = rest.slice(2);
    for (let i = 0; i < tail.length; i++) {
      const flag = tail[i]!;
      if (action === 'init' && (flag === '--suffix' || flag.startsWith('--suffix='))) {
        const value = flag === '--suffix' ? tail[++i] : flag.slice('--suffix='.length);
        if (value === undefined || value === '' || value.startsWith('--')) throw new UsageError('Flag --suffix needs a value.');
        suffixes.push(value);
      } else flags.push(flag);
    }
    const allowed = action === 'export' ? ['--data-dir', '--out'] : action === 'init' ? ['--data-dir', '--install-dir'] : ['--data-dir'];
    const values = parseFlags(flags, allowed, []);
    return { command: 'tls-ca', action, ...(suffixes.length > 0 ? { suffixes } : {}), ...optional(values, '--out', 'out'), ...optional(values, '--data-dir', 'dataDir'), ...optional(values, '--install-dir', 'installDir') };
  }
  if (command === 'tls' && rest[0] === 'import') {
    const values = parseFlags(rest.slice(1), ['--cert', '--key', '--chain', '--data-dir', '--install-dir'], []);
    if (values['--cert'] === undefined || values['--key'] === undefined) throw new UsageError('Usage: dude-hub tls import --cert <pem> --key <pem> [--chain <pem>].');
    return { command: 'tls-import', cert: values['--cert'], key: values['--key'], ...optional(values, '--chain', 'chain'), ...optional(values, '--data-dir', 'dataDir'), ...optional(values, '--install-dir', 'installDir') };
  }
  if (command === 'tls' && rest[0] === 'acme') {
    const action = rest[1];
    if (action !== 'issue' && action !== 'status') throw new UsageError('Usage: dude-hub tls acme issue --name <dns> [--agree-tos] [--staging]|status. Run "dude-hub help".');
    const names: string[] = [];
    const flags: string[] = [];
    const tail = rest.slice(2);
    for (let i = 0; i < tail.length; i++) {
      const flag = tail[i]!;
      if (action === 'issue' && (flag === '--name' || flag.startsWith('--name='))) {
        const value = flag === '--name' ? tail[++i] : flag.slice('--name='.length);
        if (value === undefined || value === '' || value.startsWith('--')) throw new UsageError('Flag --name needs a value.');
        names.push(value);
      } else flags.push(flag);
    }
    if (action === 'status') {
      const values = parseFlags(flags, ['--data-dir'], []);
      return { command: 'tls-acme', action, ...optional(values, '--data-dir', 'dataDir') };
    }
    if (names.length === 0) throw new UsageError('Usage: dude-hub tls acme issue --name <dns> [--name <dns>]... [--agree-tos] [--staging].');
    const values = parseFlags(flags, ['--email', '--agree-tos', '--staging', '--directory', '--http-port', '--open-firewall', '--data-dir', '--install-dir'], ['--agree-tos', '--staging', '--open-firewall']);
    if (values['--staging'] !== undefined && values['--directory'] !== undefined) throw new UsageError('Use either --staging or --directory <url>, not both.');
    let httpPort: number | undefined;
    if (values['--http-port'] !== undefined) {
      httpPort = Number(values['--http-port']);
      if (!/^[0-9]{1,5}$/.test(values['--http-port']) || httpPort < 1 || httpPort > 65535) throw new UsageError('Flag --http-port must be an integer from 1 to 65535.');
    }
    return {
      command: 'tls-acme', action, names, ...(values['--agree-tos'] !== undefined ? { agreeTos: true } : {}), ...(values['--staging'] !== undefined ? { staging: true } : {}), ...(values['--open-firewall'] !== undefined ? { openFirewall: true } : {}),
      ...optional(values, '--email', 'email'), ...optional(values, '--directory', 'directory'), ...(httpPort !== undefined ? { httpPort } : {}),
      ...optional(values, '--data-dir', 'dataDir'), ...optional(values, '--install-dir', 'installDir'),
    };
  }
  if (command === 'tls' && rest[0] === 'proxy-pin') {
    const action = rest[1];
    if (action !== 'add' && action !== 'remove' && action !== 'list' && action !== 'activate') throw new UsageError('Usage: dude-hub tls proxy-pin add <pem-or-spki>|activate|remove <spki>|list.');
    let value: string | undefined;
    let flags = rest.slice(2);
    if (action === 'add' || action === 'remove') {
      value = flags[0];
      if (value === undefined || value.startsWith('--')) throw new UsageError(`Usage: dude-hub tls proxy-pin ${action} <${action === 'add' ? 'pem-or-spki' : 'spki'}>.`);
      flags = flags.slice(1);
    }
    const allowed = action === 'list' ? ['--data-dir'] : action === 'add' ? ['--data-dir', '--install-dir'] : action === 'activate' ? ['--data-dir', '--install-dir', '--confirm', '--force'] : ['--data-dir', '--install-dir', '--confirm'];
    const values = parseFlags(flags, allowed, action === 'activate' ? ['--force'] : []);
    return {
      command: 'tls-proxy-pin', action, ...(value !== undefined ? { value } : {}), ...(values['--force'] !== undefined ? { force: true } : {}),
      ...optional(values, '--confirm', 'confirm'), ...optional(values, '--data-dir', 'dataDir'), ...optional(values, '--install-dir', 'installDir'),
    };
  }
  if (command === 'security') {
    if (rest[0] === 'audit-ips') {
      let mode: 'full' | 'truncated' | undefined;
      let flags = rest.slice(1);
      if (flags[0] !== undefined && !flags[0].startsWith('--')) {
        if (flags[0] !== 'full' && flags[0] !== 'truncated') throw new UsageError('Usage: dude-hub security audit-ips [full|truncated].');
        mode = flags[0];
        flags = flags.slice(1);
      }
      const values = parseFlags(flags, ['--data-dir', '--install-dir'], []);
      return { command: 'security-audit-ips', ...(mode !== undefined ? { mode } : {}), ...optional(values, '--data-dir', 'dataDir'), ...optional(values, '--install-dir', 'installDir') };
    }
    if (rest[0] !== 'blocks') throw new UsageError('Usage: dude-hub security blocks list|clear <address> | audit-ips [full|truncated].');
    const action = rest[1];
    if (action !== 'list' && action !== 'clear') throw new UsageError('Usage: dude-hub security blocks list|clear <address>.');
    let ip: string | undefined;
    let flags = rest.slice(2);
    if (action === 'clear') {
      ip = flags[0];
      if (ip === undefined || ip.startsWith('--')) throw new UsageError('Usage: dude-hub security blocks clear <address>.');
      flags = flags.slice(1);
    }
    const values = parseFlags(flags, ['--data-dir', '--install-dir'], []);
    return { command: 'security-blocks', action, ...(ip !== undefined ? { ip } : {}), ...optional(values, '--data-dir', 'dataDir'), ...optional(values, '--install-dir', 'installDir') };
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
    if (group === 'firewall') {
      const [action, ...rest2] = flags;
      if ((mode !== 'public' && mode !== 'acme') || (action !== 'on' && action !== 'off' && action !== 'status')) {
        throw new UsageError('Usage: dude-hub network firewall public|acme on|off|status. Run "dude-hub help".');
      }
      const values = parseFlags(rest2, mode === 'public' && action === 'on' ? ['--force', '--install-dir', '--data-dir'] : ['--install-dir', '--data-dir'], mode === 'public' && action === 'on' ? ['--force'] : []);
      return { command: 'network-firewall', target: mode, action, ...(values['--force'] !== undefined ? { force: true } : {}), ...dirs(values) };
    }
    if (group === 'tunnel' && (mode === 'on' || mode === 'off' || mode === 'status')) {
      const allowed = mode === 'on'
        ? ['--hostname', '--confirm', '--type', '--token-stdin', '--accept-unverified-reachability', '--install-dir', '--data-dir']
        : mode === 'off' ? ['--forget-token', '--confirm', '--install-dir', '--data-dir'] : ['--install-dir', '--data-dir'];
      const booleans = ['--token-stdin', '--accept-unverified-reachability', '--forget-token'];
      const values = parseFlags(flags, allowed, booleans.filter((flag) => allowed.includes(flag)));
      return {
        command: 'network-tunnel', action: mode,
        ...optional(values, '--hostname', 'hostname'), ...optional(values, '--confirm', 'confirm'), ...optional(values, '--type', 'type'),
        ...(values['--token-stdin'] !== undefined ? { tokenStdin: true } : {}),
        ...(values['--accept-unverified-reachability'] !== undefined ? { acceptUnverifiedReachability: true } : {}),
        ...(values['--forget-token'] !== undefined ? { forgetToken: true } : {}),
        ...dirs(values),
      };
    }
    if (group === 'proxy' && (mode === 'on' || mode === 'off' || mode === 'status')) {
      if (mode !== 'on') return { command: 'network', action: mode === 'off' ? 'proxy-off' : 'proxy-status', ...dirs(parseFlags(flags, ['--install-dir', '--data-dir'], [])) };
      const values = parseFlags(flags, ['--trusted', '--public-origin', '--install-dir', '--data-dir'], []);
      if (values['--trusted'] === undefined || values['--public-origin'] === undefined) {
        throw new UsageError('Usage: dude-hub network proxy on --trusted <cidr>[,<cidr>...] --public-origin https://<name>[:<port>].');
      }
      const trusted = values['--trusted'].split(',').map((entry) => entry.trim()).filter((entry) => entry.length > 0);
      if (trusted.length === 0) throw new UsageError('--trusted needs at least one address or CIDR.');
      return { command: 'network', action: 'proxy-on', trusted, publicOrigin: values['--public-origin'], ...dirs(values) };
    }
    if (group === 'mode' && (mode === 'private' || mode === 'public')) {
      if (mode === 'private') return { command: 'network', action: 'mode-private', ...dirs(parseFlags(flags, ['--install-dir', '--data-dir'], [])) };
      const values = parseFlags(flags, ['--accept-unverified-reachability', '--type', '--install-dir', '--data-dir'], ['--accept-unverified-reachability']);
      return {
        command: 'network', action: 'mode-public',
        ...(values['--accept-unverified-reachability'] !== undefined ? { acceptUnverifiedReachability: true } : {}),
        ...(values['--type'] !== undefined ? { type: values['--type'] } : {}),
        ...dirs(values),
      };
    }
    throw new UsageError('Usage: dude-hub network lan on|off|status | firewall public|acme on|off|status | proxy on|off|status | tunnel on|off|status | mode private|public. Run "dude-hub help".');
  }
  if (command === 'backup') return parseBackup(rest);
  if (command === 'provision') {
    const [first, ...tail] = rest;
    const action = first === 'status' ? 'status' : 'run';
    const flags = first === 'status' ? tail : rest;
    const values = parseFlags(flags, ['--install-dir', '--data-dir', '--json'], ['--json']);
    return { command: 'provision', action, ...(values['--json'] !== undefined ? { json: true } : {}), ...optional(values, '--data-dir', 'dataDir'), ...optional(values, '--install-dir', 'installDir') };
  }
  if (command === 'doctor') {
    const values = parseFlags(rest, ['--install-dir', '--data-dir', '--json'], ['--json']);
    return { command: 'doctor', ...(values['--json'] !== undefined ? { json: true } : {}), ...optional(values, '--data-dir', 'dataDir'), ...optional(values, '--install-dir', 'installDir') };
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
