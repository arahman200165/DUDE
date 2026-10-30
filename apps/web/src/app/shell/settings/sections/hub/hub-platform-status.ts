import { hubTunnelDashboardLines } from '@dude/contracts/hub';
import type {
  BackupDestinationStatus, BackupStatusResponse, HubProvisioningComponent, HubProvisioningComponentId, HubProvisioningResponse, HubTunnelStatusResponse,
} from '@dude/contracts/hub';
import type { StatusGlyphKind } from '../../../../shared/components/status-glyph/status-glyph';
import { relativeTime, relativeUntil } from './hub-format';

/**
 * Settings > Environment & Hub > Platform (32-SS1, Milestone 852, decision 5): the Hub's per-component status and the exact elevated
 * `dude-hub` command for each actionable state. Everything here is a pure mapping from the Hub's own read models (the provisioning
 * report, the tunnel status and the backup status) to rows; nothing in this file or in the panel that renders it runs, changes or
 * widens anything. A command is only text to copy and run in an elevated terminal on the Hub machine.
 */

/** `ok` works; `attention` needs the owner (also a degraded component); `off` not set up yet; `unavailable` cannot work on this Hub, by design; `unknown` not readable from this page. */
export type PlatformChip = 'ok' | 'attention' | 'off' | 'unavailable' | 'unknown';

export interface PlatformChipView {
  readonly label: string;
  readonly glyph: StatusGlyphKind;
  /** Theme-token text class. */
  readonly tone: string;
}

export const PLATFORM_CHIPS: Readonly<Record<PlatformChip, PlatformChipView>> = {
  ok: { label: 'OK', glyph: 'success', tone: 'text-success' },
  attention: { label: 'Needs attention', glyph: 'warning', tone: 'text-warning' },
  off: { label: 'Not set up', glyph: 'idle', tone: 'text-text-muted' },
  unavailable: { label: 'Unavailable on this Hub', glyph: 'offline', tone: 'text-text-muted' },
  unknown: { label: 'Not shown here', glyph: 'info', tone: 'text-info' },
};

export interface PlatformCommand {
  readonly id: string;
  readonly label: string;
  /** Copied exactly as written; `<placeholders>` are for the operator to replace. */
  readonly command: string;
  readonly note?: string;
}

export interface PlatformFact {
  readonly label: string;
  readonly value: string;
}

export interface PlatformDestination {
  readonly id: string;
  readonly title: string;
  readonly chip: PlatformChip;
  /** One sentence per fact, in reading order. */
  readonly lines: readonly string[];
  readonly commands: readonly PlatformCommand[];
}

export interface PlatformRow {
  readonly id: string;
  readonly title: string;
  readonly chip: PlatformChip;
  /** One short sentence. */
  readonly reason: string;
  /** The Hub's own next-step sentence, shown only when no command here already says it. */
  readonly next: string | null;
  readonly facts: readonly PlatformFact[];
  /** Plain-text guidance lines in a disclosure (the Cloudflare dashboard values and the disclosure), empty when none. */
  readonly guidance: readonly string[];
  readonly guidanceLabel: string | null;
  readonly commands: readonly PlatformCommand[];
  readonly destinations: readonly PlatformDestination[];
}

export interface PlatformGroup {
  readonly id: string;
  readonly title: string;
  readonly rows: readonly PlatformRow[];
}

/** What the page managed to read; a source that failed or is absent is `null` and its rows say so instead of guessing. */
export interface PlatformSources {
  readonly provisioning: HubProvisioningResponse | null;
  readonly tunnel: HubTunnelStatusResponse | null;
  readonly backup: BackupStatusResponse | null;
}

// The exact CLI forms (apps/hub/src/cli/args.ts). Placeholders in angle brackets are the operator's to fill in.
export const CMD_PROVISION: PlatformCommand = { id: 'provision', label: 'Create and check the storage components', command: 'dude-hub provision', note: 'Additive and safe to run again.' };
export const CMD_PROVISION_STATUS: PlatformCommand = { id: 'provision-status', label: 'Check again', command: 'dude-hub provision status', note: 'Read only.' };
export const CMD_TUNNEL_ON: PlatformCommand = {
  id: 'tunnel-on', label: 'Turn the tunnel on', command: 'dude-hub network tunnel on --hostname <your-domain> --token-stdin',
  note: 'Previews first and prints a one-time token; you confirm and paste the Cloudflare connector token in the terminal, never here.',
};
export const CMD_TUNNEL_STATUS: PlatformCommand = { id: 'tunnel-status', label: 'Check the tunnel', command: 'dude-hub network tunnel status', note: 'Read only.' };
export const CMD_POWER_STATUS: PlatformCommand = { id: 'power-status', label: 'Check the power settings', command: 'dude-hub power status', note: 'Read only.' };
export const CMD_POWER_APPLY: PlatformCommand = {
  id: 'power-apply', label: 'Stop this computer sleeping on AC power', command: 'dude-hub power apply',
  note: 'Previews the exact change and prints a one-time token first; "dude-hub power revert" puts the old values back.',
};
export const CMD_BACKUP_DEST_ADD: PlatformCommand = {
  id: 'backup-destination-add', label: 'Add a backup destination', command: 'dude-hub backup destination add --folder <abs dir>',
  note: 'Asks for the backup passphrase in the terminal. Use a folder on another disk or machine.',
};
export const CMD_BACKUP_SCHEDULE: PlatformCommand = { id: 'backup-schedule', label: 'Schedule unattended backups', command: 'dude-hub backup schedule set --every-hours 24' };
export const CMD_BACKUP_RUN: PlatformCommand = { id: 'backup-run', label: 'Back up now', command: 'dude-hub backup run', note: 'Verified on write; changes nothing that exists.' };
export const CMD_BACKUP_DRILL: PlatformCommand = { id: 'backup-drill', label: 'Run the restore drill now', command: 'dude-hub backup drill', note: 'Restores the newest verified backup into a scratch folder and checks it; changes nothing.' };
export const CMD_BACKUP_REACTIVATE: PlatformCommand = { id: 'backup-reactivate', label: 'Return this Hub to service', command: 'dude-hub backup reactivate', note: 'Only if this Hub was retired by a transfer and is still wanted here.' };
export const CMD_STANDBY_LIST: PlatformCommand = { id: 'standby-list', label: 'List the computers that may pull backups', command: 'dude-hub standby list', note: 'Read only.' };
export const CMD_STANDBY_GRANT: PlatformCommand = {
  id: 'standby-grant', label: 'Let a paired computer keep a warm standby', command: 'dude-hub standby grant <deviceId>',
  note: 'Previews first and prints a one-time token. The device id is on Settings > Devices. The device only ever receives encrypted backup files.',
};

/** Destination ids are lower-case letters, digits and hyphens (1 to 32); anything else never goes into a command the owner will paste. */
const DESTINATION_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;

export const COMPONENT_TITLES: Readonly<Record<HubProvisioningComponentId, string>> = {
  'content-store': 'Content store',
  fts: 'Full-text search',
  vector: 'Vector search',
  'blob-store': 'Attachment storage',
  cache: 'Cache',
  queue: 'Job queue',
  workers: 'Worker processes',
  secrets: 'Machine-bound secrets',
  tunnel: 'Cloudflare Tunnel',
  oidc: 'Google sign-in',
  power: 'Power policy',
  backup: 'Backups',
};

const COMPONENT_GROUPS: readonly { readonly id: string; readonly title: string; readonly ids: readonly HubProvisioningComponentId[] }[] = [
  { id: 'storage', title: 'Storage', ids: ['content-store', 'fts', 'vector', 'blob-store', 'cache'] },
  { id: 'processing', title: 'Queue and workers', ids: ['queue', 'workers'] },
  { id: 'access', title: 'Sign-in and access', ids: ['tunnel', 'oidc', 'secrets'] },
  { id: 'machine', title: 'This computer', ids: ['power'] },
];

/** The provisioning engine's component state as a chip: a degraded component works with a problem, so it is "needs attention". */
export function chipForComponent(state: HubProvisioningComponent['state']): PlatformChip {
  switch (state) {
    case 'ready': return 'ok';
    case 'degraded':
    case 'needs-attention': return 'attention';
    case 'not-configured': return 'off';
    case 'unavailable': return 'unavailable';
  }
}

const emptyRow = (id: string, title: string): Pick<PlatformRow, 'id' | 'title' | 'facts' | 'guidance' | 'guidanceLabel' | 'destinations' | 'next'> => ({
  id, title, facts: [], guidance: [], guidanceLabel: null, destinations: [], next: null,
});

/** The Hub's `nextAction` is shown only when it does not already contain a `dude-hub` command (the command row says it better). */
function nextText(component: HubProvisioningComponent, commands: readonly PlatformCommand[]): string | null {
  const text = component.nextAction;
  if (text === undefined || component.state === 'ready' || component.state === 'unavailable') return null;
  return commands.length > 0 && text.includes('dude-hub ') ? null : text;
}

/** Commands for a provisioning-engine component (storage, queue, workers): the additive `provision` for anything not ready. */
function engineCommands(component: HubProvisioningComponent): readonly PlatformCommand[] {
  if (component.state === 'ready' || component.state === 'unavailable') return [];
  // The vector library and FTS5 come with the Hub build, and secrets are re-entered where they were asked for: a provision run fixes none of those.
  if (component.id === 'fts' || component.id === 'vector' || component.id === 'secrets') return [];
  return [CMD_PROVISION];
}

function tunnelFacts(tunnel: HubTunnelStatusResponse | null): { facts: PlatformFact[]; guidance: string[] } {
  if (tunnel === null || !tunnel.configured) return { facts: [], guidance: [] };
  const facts: PlatformFact[] = [];
  if (tunnel.hostname !== null) facts.push({ label: 'Hostname', value: tunnel.hostname });
  facts.push({ label: 'Connector', value: tunnel.state });
  facts.push({ label: 'Connector token', value: tunnel.tokenPresent ? 'stored on this machine' : 'not stored on this machine' });
  if (tunnel.lastReadyAt !== null) facts.push({ label: 'Last ready', value: relativeTime(tunnel.lastReadyAt) });
  if (tunnel.restarts > 0) facts.push({ label: 'Restarts', value: String(tunnel.restarts) });
  if (tunnel.lastError !== null) facts.push({ label: 'Last error', value: tunnel.lastError });
  const guidance = [...(tunnel.dashboard === null ? [] : hubTunnelDashboardLines(tunnel.dashboard)), ...tunnel.disclosure];
  return { facts, guidance };
}

/** The tunnel row prefers the engine's component (one vocabulary) and falls back to the tunnel route's own state when the report is missing. */
function tunnelRow(component: HubProvisioningComponent | undefined, tunnel: HubTunnelStatusResponse | null): PlatformRow {
  const base = emptyRow('tunnel', COMPONENT_TITLES.tunnel);
  const { facts, guidance } = tunnelFacts(tunnel);
  const extra = { facts, guidance, guidanceLabel: guidance.length > 0 ? 'Cloudflare dashboard settings and what Cloudflare can see' : null };
  if (component === undefined && tunnel === null) return { ...base, chip: 'unknown', reason: 'The tunnel status could not be read.', commands: [CMD_TUNNEL_STATUS] };
  if (component === undefined && tunnel !== null) {
    if (!tunnel.supported) return { ...base, ...extra, chip: 'unavailable', reason: 'The managed tunnel runs only on a Windows Hub.', commands: [] };
    if (!tunnel.configured) return { ...base, ...extra, chip: 'off', reason: 'No managed tunnel is configured.', commands: [CMD_TUNNEL_ON] };
    const ok = tunnel.state === 'ready';
    return { ...base, ...extra, chip: ok ? 'ok' : 'attention', reason: ok ? 'Connected to Cloudflare.' : `The connector is ${tunnel.state}.`, commands: ok ? [] : [CMD_TUNNEL_STATUS] };
  }
  const c = component!;
  const chip = chipForComponent(c.state);
  let commands: readonly PlatformCommand[] = [];
  if (c.state === 'not-configured') commands = [CMD_TUNNEL_ON];
  else if (c.state === 'needs-attention' && tunnel !== null && !tunnel.tokenPresent) commands = [CMD_TUNNEL_ON];
  else if (c.state === 'needs-attention' || c.state === 'degraded') commands = [CMD_TUNNEL_STATUS];
  return { ...base, ...extra, chip, reason: c.detail, next: nextText(c, commands), commands };
}

function powerRow(component: HubProvisioningComponent | undefined): PlatformRow {
  const base = emptyRow('power', COMPONENT_TITLES.power);
  if (component === undefined) return { ...base, chip: 'unknown', reason: 'The power policy could not be read.', commands: [CMD_POWER_STATUS] };
  let commands: readonly PlatformCommand[] = [];
  if (component.state === 'not-configured') commands = [CMD_POWER_STATUS];
  else if (component.state === 'needs-attention') commands = [CMD_POWER_STATUS, CMD_POWER_APPLY];
  else if (component.state === 'degraded') commands = component.detail.includes('could not be read') ? [CMD_POWER_STATUS] : [CMD_POWER_STATUS, CMD_POWER_APPLY];
  return { ...base, chip: chipForComponent(component.state), reason: component.detail, next: nextText(component, commands), commands };
}

function secretsRow(component: HubProvisioningComponent, report: HubProvisioningResponse): PlatformRow {
  const reenter = report.secrets.filter((s) => s.needsReentry).map((s) => s.purpose);
  const facts: PlatformFact[] = report.secrets.map((s) => ({ label: s.purpose, value: s.needsReentry ? 'enter again' : s.present ? 'present' : 'not stored' }));
  return {
    ...emptyRow('secrets', COMPONENT_TITLES.secrets), chip: chipForComponent(component.state), reason: component.detail,
    next: reenter.length > 0 ? nextText(component, []) : null, facts, commands: [],
  };
}

function engineRow(component: HubProvisioningComponent): PlatformRow {
  const commands = engineCommands(component);
  return { ...emptyRow(component.id, COMPONENT_TITLES[component.id]), chip: chipForComponent(component.state), reason: component.detail, next: nextText(component, commands), commands };
}

const dateOrRaw = (iso: string): string => (Number.isNaN(Date.parse(iso)) ? iso : `${new Date(iso).toLocaleString()} (${relativeTime(iso)})`);

function destinationView(d: BackupDestinationStatus): PlatformDestination {
  const lines: string[] = [];
  const kind = d.kind === 's3' ? 'S3-compatible' : d.kind === 'drive' ? 'Google Drive' : d.kind === 'onedrive' ? 'OneDrive' : d.kind === 'local-folder' ? 'Local folder' : d.kind;
  lines.push(`${kind}${d.repoBytes === null ? '' : `, ${formatMiB(d.repoBytes)} stored`}.`);
  lines.push(d.lastSuccessAt === null ? 'No successful backup yet.' : `Last successful backup ${dateOrRaw(d.lastSuccessAt)}.`);
  if (d.lastVerifiedAt !== null) lines.push(`Last verified ${dateOrRaw(d.lastVerifiedAt)}.`);
  if (d.lastError !== null) lines.push(`Last run failed (${d.lastError})${d.lastErrorAt === null ? '' : ` ${relativeTime(d.lastErrorAt)}`}.`);
  const drill = d.lastDrillOutcome ?? null;
  const drillWhen = d.lastDrillAt ? ` ${relativeTime(d.lastDrillAt)}` : '';
  if (drill === 'success') lines.push(`Last restore drill passed${drillWhen}.`);
  else if (drill === 'failure') lines.push(`Last restore drill failed${d.lastDrillError ? ` (${d.lastDrillError})` : ''}${drillWhen}.`);
  else lines.push('No restore drill has run yet.');
  if (d.nextDueAt !== null) lines.push(`Next backup ${relativeUntil(d.nextDueAt).toLowerCase()}.`);
  if (d.nextDrillDueAt !== undefined && d.nextDrillDueAt !== null) lines.push(`Next restore drill ${relativeUntil(d.nextDrillDueAt).toLowerCase()}.`);
  const failing = d.lastError !== null || drill === 'failure' || d.overdue === true;
  const safe = DESTINATION_ID.test(d.id);
  const commands: PlatformCommand[] = [];
  if (failing && safe) {
    commands.push({ ...CMD_BACKUP_RUN, command: `dude-hub backup run --destination ${d.id}` });
    commands.push({ ...CMD_BACKUP_DRILL, command: `dude-hub backup drill --destination ${d.id}` });
  }
  return { id: d.id, title: d.label !== '' ? d.label : d.id, chip: failing ? 'attention' : 'ok', lines, commands };
}

function formatMiB(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KiB`;
  const mib = bytes / (1024 * 1024);
  return mib < 1024 ? `${mib.toFixed(mib < 10 ? 1 : 0)} MiB` : `${(mib / 1024).toFixed(1)} GiB`;
}

/** The backup row from `GET /api/v1/backup/status` (health, per-destination drill state): there is no `backup` provisioning component. */
export function backupRow(backup: BackupStatusResponse | null): PlatformRow {
  const base = emptyRow('backup', COMPONENT_TITLES.backup);
  if (backup === null) return { ...base, chip: 'unknown', reason: 'The backup status could not be read.', commands: [] };
  const destinations = backup.destinations ?? [];
  const views = destinations.map(destinationView);
  const facts: PlatformFact[] = [];
  if (backup.nextScheduledAt) facts.push({ label: 'Next scheduled run', value: relativeUntil(backup.nextScheduledAt) });
  if (backup.schedule.configured && backup.schedule.intervalHours !== undefined) facts.push({ label: 'Every', value: `${backup.schedule.intervalHours} ${backup.schedule.intervalHours === 1 ? 'hour' : 'hours'}` });
  const withViews = { ...base, facts, destinations: views };

  if (backup.authority.state === 'transferred') {
    return { ...withViews, chip: 'attention', reason: 'This Hub was transferred to another machine and is read-only.', commands: [CMD_BACKUP_REACTIVATE] };
  }
  if (destinations.length === 0) {
    return { ...withViews, chip: 'off', reason: backup.schedule.configured ? 'A schedule is set but there is no backup destination to run into.' : 'No backup destination is set up, so nothing is backed up.', commands: [CMD_BACKUP_DEST_ADD, CMD_BACKUP_SCHEDULE] };
  }
  const problems: string[] = [];
  const commands: PlatformCommand[] = [];
  const health = backup.health;
  if (health?.overdue === true || destinations.some((d) => d.overdue === true)) problems.push('A backup is overdue.');
  if (health?.lastRunFailed === true || destinations.some((d) => d.lastError !== null)) problems.push('The last backup run failed.');
  if (health?.drillFailed === true || destinations.some((d) => d.lastDrillOutcome === 'failure')) problems.push('The last restore drill failed.');
  if (backup.schedule.keyPresent === false) problems.push('The protected key for unattended backups is missing.');
  if (!backup.schedule.configured) problems.push('No schedule is set, so backups run only when you start one.');
  if (problems.length > 0) {
    if (backup.schedule.configured === false || backup.schedule.keyPresent === false) commands.push(CMD_BACKUP_SCHEDULE);
    commands.push(CMD_BACKUP_RUN, CMD_BACKUP_DRILL);
    return { ...withViews, chip: 'attention', reason: problems.join(' '), commands };
  }
  const last = backup.lastBackup;
  const reason = last !== null && last.ok ? `The last backup succeeded ${relativeTime(last.at)} and no problem is reported.` : 'Backups are scheduled and no problem is reported.';
  return { ...withViews, chip: 'ok', reason, commands: [] };
}

/**
 * The warm standby has no owner read route (the grant lives on the elevated admin pipe, PD-151), so this page cannot say who holds a grant:
 * it says that, and offers the two commands. Never an invented status.
 */
export function standbyRow(): PlatformRow {
  return {
    ...emptyRow('standby', 'Warm standby'), chip: 'unknown',
    reason: 'Which paired computers may pull the encrypted backups is shown only on the Hub machine.',
    commands: [CMD_STANDBY_LIST, CMD_STANDBY_GRANT],
  };
}

function setupRow(report: HubProvisioningResponse): PlatformRow {
  const run = report.lastRun;
  const base = emptyRow('setup', 'SaveSphere setup');
  const facts: PlatformFact[] = run === null ? [] : [{ label: 'Last provisioning run', value: `${run.outcome === 'ok' ? 'completed' : 'a step failed'} ${relativeTime(run.at)}` }];
  switch (report.overall) {
    case 'ready': return { ...base, facts, chip: 'ok', reason: 'Every component works, or is unavailable on this Hub by design.', commands: [] };
    case 'degraded': return { ...base, facts, chip: 'attention', reason: 'Setup is complete but something works with a problem; see the components below.', commands: [CMD_PROVISION_STATUS] };
    case 'needs-attention': return { ...base, facts, chip: 'attention', reason: 'A component needs you; see the components below.', commands: [CMD_PROVISION_STATUS] };
    case 'needs-provisioning': return { ...base, facts, chip: 'attention', reason: 'This Hub needs to be provisioned again (after a restore, a move, a missing folder or a secret to enter again).', commands: [CMD_PROVISION] };
    case 'not-provisioned': return { ...base, facts, chip: 'off', reason: 'SaveSphere storage has not been created on this Hub yet.', commands: [CMD_PROVISION] };
  }
}

/** All rows, grouped for display. Pure: the same sources always give the same groups. */
export function buildPlatformGroups(sources: PlatformSources): readonly PlatformGroup[] {
  const { provisioning, tunnel, backup } = sources;
  const byId = new Map((provisioning?.components ?? []).map((c) => [c.id, c] as const));
  const groups: PlatformGroup[] = [];
  groups.push({
    id: 'setup', title: 'Setup',
    rows: [provisioning === null
      ? { ...emptyRow('setup', 'SaveSphere setup'), chip: 'unknown', reason: 'The provisioning status could not be read.', commands: [CMD_PROVISION_STATUS] } satisfies PlatformRow
      : setupRow(provisioning)],
  });
  for (const group of COMPONENT_GROUPS) {
    const rows: PlatformRow[] = [];
    for (const id of group.ids) {
      const component = byId.get(id);
      if (id === 'tunnel') rows.push(tunnelRow(component, tunnel));
      else if (id === 'power') rows.push(powerRow(component));
      else if (component === undefined) {
        // `oidc` is built but a Hub from before Milestone 841 will not report it; any engine component missing from a loaded report is listed as unread, never guessed.
        if (provisioning !== null) rows.push({ ...emptyRow(id, COMPONENT_TITLES[id]), chip: 'unknown', reason: 'This Hub did not report this component.', commands: [] });
        else rows.push({ ...emptyRow(id, COMPONENT_TITLES[id]), chip: 'unknown', reason: 'The provisioning status could not be read.', commands: [] });
      } else if (id === 'secrets' && provisioning !== null) rows.push(secretsRow(component, provisioning));
      else rows.push(engineRow(component));
    }
    groups.push({ id: group.id, title: group.title, rows });
  }
  groups.push({ id: 'backup', title: 'Backups and standby', rows: [backupRow(backup), standbyRow()] });
  return groups;
}

/** How many rows need the owner; drives the summary line and the live announcement after a refresh. */
export function countNeedingAttention(groups: readonly PlatformGroup[]): number {
  return groups.reduce((n, g) => n + g.rows.filter((r) => r.chip === 'attention').length, 0);
}
