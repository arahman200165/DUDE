import { HUB_PROVISIONING_COMPONENT_STATES } from '@dude/contracts/hub';
import type { BackupDestinationStatus, BackupStatusResponse, HubProvisioningComponent, HubProvisioningComponentId, HubProvisioningResponse, HubTunnelStatusResponse } from '@dude/contracts/hub';
import {
  CMD_BACKUP_DEST_ADD, CMD_BACKUP_DRILL, CMD_BACKUP_REACTIVATE, CMD_POWER_APPLY, CMD_PROVISION, CMD_TUNNEL_ON, CMD_TUNNEL_STATUS, PLATFORM_CHIPS,
  backupRow, buildPlatformGroups, chipForComponent, countNeedingAttention, standbyRow, type PlatformRow,
} from './hub-platform-status';

const NOW = '2026-10-29T12:00:00.000Z';

const component = (id: HubProvisioningComponentId, state: HubProvisioningComponent['state'], detail = 'detail.', nextAction?: string): HubProvisioningComponent =>
  ({ id, state, detail, checkedAt: NOW, ...(nextAction === undefined ? {} : { nextAction }) });

const ALL_IDS: readonly HubProvisioningComponentId[] = ['content-store', 'fts', 'vector', 'blob-store', 'cache', 'queue', 'workers', 'secrets', 'tunnel', 'oidc', 'power'];

function report(overrides: Partial<HubProvisioningResponse> = {}, byId: Partial<Record<HubProvisioningComponentId, HubProvisioningComponent>> = {}): HubProvisioningResponse {
  return {
    overall: 'ready', checkedAt: NOW, lastRun: { at: NOW, outcome: 'ok' }, secrets: [], commands: ['dude-hub provision', 'dude-hub provision status'],
    components: ALL_IDS.map((id) => byId[id] ?? component(id, 'ready', `${id} works.`)), ...overrides,
  };
}

const tunnel = (overrides: Partial<HubTunnelStatusResponse> = {}): HubTunnelStatusResponse => ({
  configured: false, enabled: false, hostname: null, supported: true, state: 'not-configured', ready: false, tokenPresent: false, restarts: 0, lastError: null, startedAt: null, lastReadyAt: null,
  dashboard: null, disclosure: [], logTail: [], ...overrides,
});

const destination = (overrides: Partial<BackupDestinationStatus> = {}): BackupDestinationStatus => ({
  id: 'local-1', kind: 'local-folder', label: 'Nightly disk', lastSuccessAt: NOW, lastBackupId: 'b1', lastError: null, lastErrorAt: null, lastVerifiedAt: NOW, repoBytes: 5 * 1024 * 1024,
  nextDueAt: null, ...overrides,
});

const backup = (overrides: Partial<BackupStatusResponse> = {}): BackupStatusResponse => ({
  authority: { epoch: 1, state: 'active' }, lastBackup: { at: NOW, ok: true }, schedule: { configured: true, intervalHours: 24, keyPresent: true }, defaultFolder: 'backups',
  devicesNeedingRePair: 0, destinations: [destination()], ...overrides,
});

const rowOf = (groups: ReturnType<typeof buildPlatformGroups>, id: string): PlatformRow => {
  const row = groups.flatMap((g) => g.rows).find((r) => r.id === id);
  if (!row) throw new Error(`no row ${id}`);
  return row;
};
const texts = (row: PlatformRow): string[] => row.commands.map((c) => c.command);

describe('Platform status mapping (Milestone 852)', () => {
  describe('component state to chip', () => {
    it('maps every state of the contract, so a new one fails here before it renders blank', () => {
      expect(Object.fromEntries(HUB_PROVISIONING_COMPONENT_STATES.map((s) => [s, chipForComponent(s)]))).toEqual({
        ready: 'ok', degraded: 'attention', unavailable: 'unavailable', 'not-configured': 'off', 'needs-attention': 'attention',
      });
    });

    it('gives every chip a label, a glyph and a theme-token tone (never a raw color)', () => {
      for (const view of Object.values(PLATFORM_CHIPS)) {
        expect(view.label.length).toBeGreaterThan(1);
        expect(view.tone).toMatch(/^text-(success|warning|info|text-muted)$/);
      }
    });
  });

  describe('storage, queue and workers', () => {
    it('shows a healthy Hub with no command anywhere that needs one', () => {
      const groups = buildPlatformGroups({ provisioning: report(), tunnel: tunnel(), backup: backup() });
      expect(rowOf(groups, 'content-store').chip).toBe('ok');
      expect(rowOf(groups, 'content-store').commands).toEqual([]);
      expect(rowOf(groups, 'setup').chip).toBe('ok');
      expect(countNeedingAttention(groups)).toBe(0);
    });

    it('offers the additive provision command for a storage component that is not ready, with the Hub sentence as the reason', () => {
      const groups = buildPlatformGroups({ provisioning: report({}, { 'blob-store': component('blob-store', 'not-configured', 'The blob directories have not been created yet.', 'Run "dude-hub provision".') }), tunnel: null, backup: null });
      const row = rowOf(groups, 'blob-store');
      expect(row).toMatchObject({ chip: 'off', reason: 'The blob directories have not been created yet.' });
      expect(row.commands).toEqual([CMD_PROVISION]);
      // The Hub's own sentence names the command already shown, so it is not repeated.
      expect(row.next).toBeNull();
    });

    it('keeps the Hub next-step sentence when no command here covers it', () => {
      const groups = buildPlatformGroups({ provisioning: report({}, { queue: component('queue', 'needs-attention', 'The queue runner is not running.', 'Restart the Hub service so the queue runner starts.') }), tunnel: null, backup: null });
      expect(rowOf(groups, 'queue')).toMatchObject({ chip: 'attention', next: 'Restart the Hub service so the queue runner starts.' });
    });

    it('reports vector search unavailable by design as unavailable, with no command and no attention', () => {
      const groups = buildPlatformGroups({ provisioning: report({}, { vector: component('vector', 'unavailable', 'Vector search is unavailable on this build.', 'Reinstall or update the Hub.') }), tunnel: null, backup: null });
      const row = rowOf(groups, 'vector');
      expect(row).toMatchObject({ chip: 'unavailable', next: null });
      expect(row.commands).toEqual([]);
      expect(countNeedingAttention(groups)).toBe(0);
    });

    it('never offers provision for components it cannot fix (FTS5, the vector library, secrets)', () => {
      const groups = buildPlatformGroups({
        provisioning: report({}, { fts: component('fts', 'degraded', 'No FTS5.'), secrets: component('secrets', 'needs-attention', '1 secret must be entered again.') }), tunnel: null, backup: null,
      });
      expect(rowOf(groups, 'fts').commands).toEqual([]);
      expect(rowOf(groups, 'secrets').commands).toEqual([]);
    });
  });

  describe('re-provision and secrets re-entry', () => {
    it.each([
      ['not-provisioned', 'off', ['dude-hub provision']],
      ['needs-provisioning', 'attention', ['dude-hub provision']],
      ['needs-attention', 'attention', ['dude-hub provision status']],
      ['degraded', 'attention', ['dude-hub provision status']],
      ['ready', 'ok', []],
    ] as const)('maps the overall state %s', (overall, chip, commands) => {
      const row = rowOf(buildPlatformGroups({ provisioning: report({ overall }), tunnel: null, backup: null }), 'setup');
      expect(row.chip).toBe(chip);
      expect(texts(row)).toEqual(commands);
    });

    it('lists each secret purpose and which ones need to be entered again, never a value', () => {
      const secrets = [{ purpose: 'tunnel.connectorToken', present: false, needsReentry: true }, { purpose: 'backup.masterKey', present: true, needsReentry: false }];
      const groups = buildPlatformGroups({ provisioning: report({ secrets, overall: 'needs-provisioning' }, { secrets: component('secrets', 'needs-attention', '1 secret must be entered again (tunnel.connectorToken).', 'Enter them again in the setup step that asked for them, on the Hub machine.') }), tunnel: null, backup: null });
      const row = rowOf(groups, 'secrets');
      expect(row.facts).toEqual([{ label: 'tunnel.connectorToken', value: 'enter again' }, { label: 'backup.masterKey', value: 'present' }]);
      expect(row.next).toMatch(/Enter them again/);
    });

    it('says plainly when the provisioning report could not be read instead of guessing', () => {
      const groups = buildPlatformGroups({ provisioning: null, tunnel: null, backup: null });
      expect(rowOf(groups, 'setup')).toMatchObject({ chip: 'unknown', reason: 'The provisioning status could not be read.' });
      expect(rowOf(groups, 'content-store')).toMatchObject({ chip: 'unknown' });
      expect(rowOf(groups, 'backup')).toMatchObject({ chip: 'unknown' });
    });

    it('lists a component the Hub did not report as unread, never as ok', () => {
      const partial = report({ components: [component('content-store', 'ready')] });
      expect(rowOf(buildPlatformGroups({ provisioning: partial, tunnel: null, backup: null }), 'queue')).toMatchObject({ chip: 'unknown', reason: 'This Hub did not report this component.' });
    });
  });

  describe('tunnel', () => {
    it('not configured: off, with the exact turn-on command and no dashboard guidance', () => {
      const row = rowOf(buildPlatformGroups({ provisioning: report({}, { tunnel: component('tunnel', 'not-configured', 'No managed tunnel is configured.') }), tunnel: tunnel(), backup: null }), 'tunnel');
      expect(row.chip).toBe('off');
      expect(texts(row)).toEqual(['dude-hub network tunnel on --hostname <your-domain> --token-stdin']);
      expect(row.guidance).toEqual([]);
    });

    it('connected: ok with facts, the dashboard lines from the contract and the disclosure, and no command', () => {
      const status = tunnel({
        configured: true, enabled: true, hostname: 'hub.example.com', state: 'ready', ready: true, tokenPresent: true, lastReadyAt: NOW, restarts: 2,
        dashboard: { hostname: 'hub.example.com', service: 'https://127.0.0.1:47600', noTlsVerify: true, httpHostHeader: null }, disclosure: ['Cloudflare terminates TLS at its edge.'],
      });
      const row = rowOf(buildPlatformGroups({ provisioning: report({}, { tunnel: component('tunnel', 'ready', 'Connected to Cloudflare.') }), tunnel: status, backup: null }), 'tunnel');
      expect(row.chip).toBe('ok');
      expect(row.commands).toEqual([]);
      expect(row.facts).toEqual(expect.arrayContaining([{ label: 'Hostname', value: 'hub.example.com' }, { label: 'Connector token', value: 'stored on this machine' }, { label: 'Restarts', value: '2' }]));
      expect(row.guidance[0]).toBe('Public hostname: hub.example.com (your domain exactly, no path)');
      expect(row.guidance).toContain('Cloudflare terminates TLS at its edge.');
      expect(row.guidanceLabel).not.toBeNull();
    });

    it('configured but the token is missing (a restore): attention with the turn-on command, not just a status check', () => {
      const status = tunnel({ configured: true, enabled: true, hostname: 'hub.example.com', state: 'failed', lastError: 'token-missing', tokenPresent: false });
      const row = rowOf(buildPlatformGroups({ provisioning: report({}, { tunnel: component('tunnel', 'needs-attention', 'The tunnel is configured but no connector token is stored on this machine.') }), tunnel: status, backup: null }), 'tunnel');
      expect(row.chip).toBe('attention');
      expect(row.commands).toEqual([CMD_TUNNEL_ON]);
      expect(row.facts).toContainEqual({ label: 'Last error', value: 'token-missing' });
    });

    it('failed or degraded with the token present: the read-only status command', () => {
      const status = tunnel({ configured: true, enabled: true, hostname: 'hub.example.com', state: 'degraded', tokenPresent: true });
      const row = rowOf(buildPlatformGroups({ provisioning: report({}, { tunnel: component('tunnel', 'degraded', 'The tunnel was connected and stopped answering.', 'dude-hub network tunnel status') }), tunnel: status, backup: null }), 'tunnel');
      expect(row.commands).toEqual([CMD_TUNNEL_STATUS]);
      expect(row.next).toBeNull();
    });

    it('a non-Windows Hub is unavailable by design', () => {
      const row = rowOf(buildPlatformGroups({ provisioning: report({}, { tunnel: component('tunnel', 'unavailable', 'The managed tunnel runs only on a Windows Hub.') }), tunnel: tunnel({ supported: false }), backup: null }), 'tunnel');
      expect(row.chip).toBe('unavailable');
      expect(row.commands).toEqual([]);
    });

    it('without the provisioning report it falls back to the tunnel route alone', () => {
      const ready = rowOf(buildPlatformGroups({ provisioning: null, tunnel: tunnel({ configured: true, hostname: 'h.example.com', state: 'ready', tokenPresent: true }), backup: null }), 'tunnel');
      expect(ready.chip).toBe('ok');
      expect(rowOf(buildPlatformGroups({ provisioning: null, tunnel: tunnel({ supported: false }), backup: null }), 'tunnel').chip).toBe('unavailable');
      expect(rowOf(buildPlatformGroups({ provisioning: null, tunnel: tunnel(), backup: null }), 'tunnel').chip).toBe('off');
      expect(rowOf(buildPlatformGroups({ provisioning: null, tunnel: null, backup: null }), 'tunnel').chip).toBe('unknown');
    });
  });

  describe('power policy', () => {
    it('needs attention after a regression: check and apply, each exactly as the CLI takes it', () => {
      const row = rowOf(buildPlatformGroups({ provisioning: report({}, { power: component('power', 'needs-attention', 'This computer can sleep again.', 'On the Hub machine, in an elevated terminal: dude-hub power apply') }), tunnel: null, backup: null }), 'power');
      expect(texts(row)).toEqual(['dude-hub power status', 'dude-hub power apply']);
      expect(row.commands).toContain(CMD_POWER_APPLY);
      expect(row.next).toBeNull();
    });

    it('degraded because the settings could not be read offers only the read-only check', () => {
      const row = rowOf(buildPlatformGroups({ provisioning: report({}, { power: component('power', 'degraded', 'The power settings could not be read, so the policy cannot be confirmed.') }), tunnel: null, backup: null }), 'power');
      expect(texts(row)).toEqual(['dude-hub power status']);
    });

    it('ok and unavailable (Docker) carry no command', () => {
      expect(rowOf(buildPlatformGroups({ provisioning: report(), tunnel: null, backup: null }), 'power').commands).toEqual([]);
      const docker = rowOf(buildPlatformGroups({ provisioning: report({}, { power: component('power', 'unavailable', 'Power policy is Windows only.') }), tunnel: null, backup: null }), 'power');
      expect(docker).toMatchObject({ chip: 'unavailable', commands: [] });
    });
  });

  describe('backup, destinations and the restore drill', () => {
    it('ok: every destination clean, no command', () => {
      const row = backupRow(backup({ destinations: [destination({ lastDrillOutcome: 'success', lastDrillAt: NOW })] }));
      expect(row.chip).toBe('ok');
      expect(row.commands).toEqual([]);
      expect(row.destinations[0]).toMatchObject({ id: 'local-1', title: 'Nightly disk', chip: 'ok' });
      expect(row.destinations[0].lines.join(' ')).toMatch(/restore drill passed/);
    });

    it('names each destination kind in plain words (the Google Drive destination reads as Google Drive)', () => {
      const lines = (kind: string): string => backupRow(backup({ destinations: [destination({ kind })] })).destinations[0].lines[0] ?? '';
      expect(lines('drive')).toMatch(/^Google Drive,/);
      expect(lines('s3')).toMatch(/^S3-compatible,/);
      expect(lines('local-folder')).toMatch(/^Local folder,/);
    });

    it('no destination: off, with the add-destination and schedule commands', () => {
      const row = backupRow(backup({ destinations: [], lastBackup: null, schedule: { configured: false } }));
      expect(row.chip).toBe('off');
      expect(row.commands).toContainEqual(CMD_BACKUP_DEST_ADD);
      expect(texts(row)).toContain('dude-hub backup schedule set --every-hours 24');
    });

    it('overdue: needs attention, with the backup and drill commands and per-destination commands for a safe id', () => {
      const row = backupRow(backup({ destinations: [destination({ overdue: true })], health: { overdue: true, lastRunFailed: false, drillFailed: false, noDestinationSince: null } }));
      expect(row.chip).toBe('attention');
      expect(row.reason).toContain('overdue');
      expect(texts(row)).toEqual(['dude-hub backup run', 'dude-hub backup drill']);
      expect(row.destinations[0].commands.map((c) => c.command)).toEqual(['dude-hub backup run --destination local-1', 'dude-hub backup drill --destination local-1']);
    });

    it('a failed restore drill shows the closed code and when, and offers the drill command', () => {
      const failing = destination({ lastDrillOutcome: 'failure', lastDrillError: 'insufficient-space', lastDrillAt: NOW });
      const row = backupRow(backup({ destinations: [failing], health: { overdue: false, lastRunFailed: false, drillFailed: true, noDestinationSince: null } }));
      expect(row.chip).toBe('attention');
      expect(row.reason).toContain('restore drill failed');
      expect(row.destinations[0].lines.join(' ')).toContain('insufficient-space');
      expect(row.commands).toContainEqual(CMD_BACKUP_DRILL);
    });

    it('a failed run shows its short code and the last time it failed', () => {
      const row = backupRow(backup({ destinations: [destination({ lastError: 'destination-unreachable', lastErrorAt: NOW })] }));
      expect(row.chip).toBe('attention');
      expect(row.destinations[0].lines.join(' ')).toMatch(/Last run failed \(destination-unreachable\)/);
    });

    it('never puts an id that is not a plain destination id into a command the owner will paste', () => {
      const row = backupRow(backup({ destinations: [destination({ id: 'x; calc.exe', lastError: 'boom' })] }));
      expect(row.destinations[0].commands).toEqual([]);
    });

    it('a missing unattended key or no schedule needs attention and offers the schedule command', () => {
      expect(texts(backupRow(backup({ schedule: { configured: true, intervalHours: 24, keyPresent: false } })))).toContain('dude-hub backup schedule set --every-hours 24');
      expect(backupRow(backup({ schedule: { configured: false } })).chip).toBe('attention');
    });

    it('a transferred Hub is attention with the reactivate command only', () => {
      const row = backupRow(backup({ authority: { epoch: 3, state: 'transferred' } }));
      expect(row).toMatchObject({ chip: 'attention' });
      expect(row.commands).toEqual([CMD_BACKUP_REACTIVATE]);
    });

    it('an unreadable status is unknown, not ok', () => {
      expect(backupRow(null).chip).toBe('unknown');
    });

    it('formats stored bytes without inventing precision', () => {
      expect(backupRow(backup({ destinations: [destination({ repoBytes: 512 })] })).destinations[0].lines[0]).toContain('1 KiB stored');
      expect(backupRow(backup({ destinations: [destination({ repoBytes: 3 * 1024 ** 3 })] })).destinations[0].lines[0]).toContain('3.0 GiB stored');
    });
  });

  describe('warm standby', () => {
    it('is not shown here (no owner read exists): it never claims a status and only offers the list and grant commands', () => {
      const row = standbyRow();
      expect(row.chip).toBe('unknown');
      expect(row.facts).toEqual([]);
      expect(row.destinations).toEqual([]);
      expect(texts(row)).toEqual(['dude-hub standby list', 'dude-hub standby grant <deviceId>']);
    });
  });

  describe('the page can never widen exposure', () => {
    it('every command is a dude-hub CLI line the owner copies; none carries a typed confirmation phrase or a token', () => {
      const groups = buildPlatformGroups({
        provisioning: report({ overall: 'needs-provisioning' }, {
          tunnel: component('tunnel', 'not-configured'), power: component('power', 'needs-attention'), queue: component('queue', 'needs-attention'),
        }),
        tunnel: tunnel(), backup: backup({ destinations: [destination({ overdue: true, lastDrillOutcome: 'failure' })], schedule: { configured: false } }),
      });
      const all = groups.flatMap((g) => g.rows).flatMap((r) => [...r.commands, ...r.destinations.flatMap((d) => d.commands)]);
      expect(all.length).toBeGreaterThan(5);
      for (const c of all) {
        expect(c.command).toMatch(/^dude-hub [a-z]/);
        expect(c.command).not.toMatch(/EXPOSE HUB|--type|--confirm|--accept-unverified|DELETE|REPLACE HUB|THE OLD HUB/);
      }
    });
  });
});
