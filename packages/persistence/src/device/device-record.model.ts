export const DEVICE_RECORD_SCHEMA_VERSION = 1;

export type EnrollmentState = 'standalone' | 'enrolled' | 'revoked';
export const ENROLLMENT_STATES: readonly EnrollmentState[] = ['standalone', 'enrolled', 'revoked'];

/** Public enrollment details (never key material). Required exactly when the state is not 'standalone'. */
export interface DeviceEnrollment {
  environmentId: string;
  hubInstanceId: string;
  hubUrl: string;
  /** ISO-8601. */
  enrolledAt: string;
}

export type DevicePlatform = 'windows' | 'macos' | 'linux' | 'web' | 'android' | 'ios' | 'unknown';
export const DEVICE_PLATFORMS: readonly DevicePlatform[] = ['windows', 'macos', 'linux', 'web', 'android', 'ios', 'unknown'];

export type DeviceCapabilities = Record<string, boolean>;

export interface DeviceRecord {
  schemaVersion: number;
  deviceId: string;
  displayName: string;
  platform: DevicePlatform;
  os: string;
  arch: string;
  appVersion: string;
  storeSchemaVersion: number;
  capabilities: DeviceCapabilities;
  hubEligible: boolean;
  enrollmentState: EnrollmentState;
  /** Present iff `enrollmentState` is 'enrolled' or 'revoked'. */
  enrollment?: DeviceEnrollment;
  /** Previous deviceId when this store was detected as a clone. */
  clonedFrom?: string;
  /** ISO-8601 timestamps. */
  createdAt: string;
  lastStartedAt: string;
}

/** Friendly default name. Never derived from the machine hostname. */
export function defaultDisplayName(platform: DevicePlatform): string {
  switch (platform) {
    case 'windows': return 'Windows PC';
    case 'macos': return 'Mac';
    case 'linux': return 'Linux PC';
    case 'web': return 'Web browser';
    case 'android': return 'Android device';
    case 'ios': return 'iPhone or iPad';
    default: return 'Device';
  }
}

export type DisplayNameResult = { ok: true; value: string } | { ok: false; error: string };

export function validateDisplayName(raw: unknown): DisplayNameResult {
  if (typeof raw !== 'string') return { ok: false, error: 'Name must be text.' };
  const value = raw.trim();
  if (value.length < 1) return { ok: false, error: 'Name cannot be empty.' };
  if (value.length > 64) return { ok: false, error: 'Name must be 64 characters or fewer.' };
  if (/[\u0000-\u001f\u007f-\u009f]/.test(value)) return { ok: false, error: 'Name cannot contain control characters.' };
  return { ok: true, value };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
function isIso(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0 && !Number.isNaN(Date.parse(v));
}
function isStr(v: unknown): v is string {
  return typeof v === 'string';
}

/** Strict shape validation; returns null for anything malformed. */
export function decodeDeviceRecord(raw: unknown): DeviceRecord | null {
  if (!isObject(raw)) return null;
  const r = raw;
  if (r['schemaVersion'] !== DEVICE_RECORD_SCHEMA_VERSION) return null;
  if (!isStr(r['deviceId']) || r['deviceId'].length === 0) return null;
  const name = validateDisplayName(r['displayName']);
  if (!name.ok) return null;
  if (!DEVICE_PLATFORMS.includes(r['platform'] as DevicePlatform)) return null;
  if (!isStr(r['os']) || !isStr(r['arch']) || !isStr(r['appVersion'])) return null;
  if (typeof r['storeSchemaVersion'] !== 'number' || !Number.isInteger(r['storeSchemaVersion']) || r['storeSchemaVersion'] < 0) return null;
  const caps = r['capabilities'];
  if (!isObject(caps)) return null;
  const capabilities: DeviceCapabilities = {};
  for (const [k, v] of Object.entries(caps)) {
    if (typeof v !== 'boolean') return null;
    capabilities[k] = v;
  }
  if (typeof r['hubEligible'] !== 'boolean') return null;
  const state = r['enrollmentState'];
  if (!ENROLLMENT_STATES.includes(state as EnrollmentState)) return null;
  let enrollment: DeviceEnrollment | undefined;
  if (state === 'standalone') {
    if (r['enrollment'] !== undefined) return null;
  } else {
    const e = r['enrollment'];
    if (!isObject(e)) return null;
    if (!isStr(e['environmentId']) || e['environmentId'].length === 0) return null;
    if (!isStr(e['hubInstanceId']) || e['hubInstanceId'].length === 0) return null;
    if (!isStr(e['hubUrl']) || e['hubUrl'].length === 0) return null;
    if (!isIso(e['enrolledAt'])) return null;
    enrollment = { environmentId: e['environmentId'], hubInstanceId: e['hubInstanceId'], hubUrl: e['hubUrl'], enrolledAt: e['enrolledAt'] };
  }
  if (r['clonedFrom'] !== undefined && !isStr(r['clonedFrom'])) return null;
  if (!isIso(r['createdAt']) || !isIso(r['lastStartedAt'])) return null;
  const out: DeviceRecord = {
    schemaVersion: DEVICE_RECORD_SCHEMA_VERSION,
    deviceId: r['deviceId'],
    displayName: name.value,
    platform: r['platform'] as DevicePlatform,
    os: r['os'],
    arch: r['arch'],
    appVersion: r['appVersion'],
    storeSchemaVersion: r['storeSchemaVersion'],
    capabilities,
    hubEligible: r['hubEligible'],
    enrollmentState: state as EnrollmentState,
    createdAt: r['createdAt'],
    lastStartedAt: r['lastStartedAt'],
  };
  if (enrollment) out.enrollment = enrollment;
  if (r['clonedFrom'] !== undefined) out.clonedFrom = r['clonedFrom'] as string;
  return out;
}
