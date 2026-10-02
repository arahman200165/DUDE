import { createHash } from 'node:crypto';
import { defaultDisplayName, uuidv7, validateDisplayName } from '@dude/persistence';
import type { DeviceCapabilities, DevicePlatform, DeviceRecord } from '@dude/persistence';
import type { Db } from './sqlite.js';
import { getMeta, setMeta, transaction } from './sqlite.js';

export interface AppInfo { appVersion: string; platform: DevicePlatform; os: string; arch: string }

export interface IdentityOptions {
  /** Windows MachineGuid; null on hosts without one (no clone detection). */
  machineGuid: string | null;
  appInfo: AppInfo;
  capabilities: DeviceCapabilities;
  now: () => Date;
  randomBytes: (n: number) => Uint8Array;
}

const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
const hashMachine = (salt: string, guid: string): string => createHash('sha256').update(salt + guid).digest('hex');

/** Create the device identity on first run; detect clones and refresh bookkeeping on later runs. */
export function ensureIdentity(db: Db, options: IdentityOptions): DeviceRecord {
  const { machineGuid, appInfo, now, randomBytes } = options;
  const iso = now().toISOString();
  const newId = (): string => uuidv7(randomBytes, () => now().getTime());

  transaction(db, () => {
    if (getMeta(db, 'device_id') === undefined) {
      setMeta(db, 'store_id', newId());
      setMeta(db, 'device_id', newId());
      setMeta(db, 'environment_id', newId());
      setMeta(db, 'display_name', defaultDisplayName(appInfo.platform));
      const salt = hex(randomBytes(16));
      setMeta(db, 'machine_salt', salt);
      if (machineGuid !== null) setMeta(db, 'machine_hash', hashMachine(salt, machineGuid));
      setMeta(db, 'created_at', iso);
    } else {
      const storedHash = getMeta(db, 'machine_hash');
      if (machineGuid !== null && storedHash !== undefined) {
        const salt = getMeta(db, 'machine_salt') ?? '';
        if (hashMachine(salt, machineGuid) !== storedHash) {
          const oldId = getMeta(db, 'device_id') as string;
          const fresh = newId();
          setMeta(db, 'cloned_from', oldId);
          setMeta(db, 'device_id', fresh);
          setMeta(db, 'machine_hash', hashMachine(salt, machineGuid));
          db.prepare("UPDATE outbox SET device_id = ? WHERE status = 'unsent-standalone'").run(fresh);
          db.exec('UPDATE secret_refs SET needs_reentry = 1');
        }
      } else if (machineGuid !== null && storedHash === undefined) {
        // A store first created without a MachineGuid adopts one without being treated as a clone.
        const salt = getMeta(db, 'machine_salt') ?? hex(randomBytes(16));
        setMeta(db, 'machine_salt', salt);
        setMeta(db, 'machine_hash', hashMachine(salt, machineGuid));
      }
    }
    setMeta(db, 'last_started_at', iso);
    setMeta(db, 'app_version', appInfo.appVersion);
    setMeta(db, 'platform', appInfo.platform);
    setMeta(db, 'os', appInfo.os);
    setMeta(db, 'arch', appInfo.arch);
  });

  return readDeviceRecord(db, options.capabilities);
}

export function readDeviceRecord(db: Db, capabilities: DeviceCapabilities): DeviceRecord {
  const m = (key: string): string => getMeta(db, key) ?? '';
  const platform = (m('platform') || 'unknown') as DevicePlatform;
  const record: DeviceRecord = {
    schemaVersion: 1,
    deviceId: m('device_id'),
    displayName: m('display_name'),
    platform,
    os: m('os'),
    arch: m('arch'),
    appVersion: m('app_version'),
    storeSchemaVersion: Number(m('schema_version')) || 0,
    capabilities,
    hubEligible: platform !== 'web',
    enrollmentState: 'standalone',
    createdAt: m('created_at'),
    lastStartedAt: m('last_started_at'),
  };
  const cloned = getMeta(db, 'cloned_from');
  if (cloned !== undefined) record.clonedFrom = cloned;
  return record;
}

export type RenameResult = { ok: true; value: string } | { ok: false; error: string };

export function renameDevice(db: Db, name: unknown): RenameResult {
  const result = validateDisplayName(name);
  if (!result.ok) return result;
  setMeta(db, 'display_name', result.value);
  return result;
}
