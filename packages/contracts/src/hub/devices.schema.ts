import Type, { type Static } from 'typebox';

/**
 * Device registry contracts (Phase 31C, PD-030 to PD-033). Everything here is portable: no Node APIs, so the Desktop
 * Agent, the web app and the Hub share one definition of the pairing string and the signed messages.
 */

/** Mirrors `DEVICE_PLATFORMS` in `@dude/persistence` (contracts cannot depend on it; a Hub spec asserts they match). */
export const DEVICE_PLATFORMS = ['windows', 'macos', 'linux', 'web', 'android', 'ios', 'unknown'] as const;
export type DeviceRegistryPlatform = (typeof DEVICE_PLATFORMS)[number];

export const DEVICE_CAPABILITY_VOCABULARY_VERSION = 1;
/**
 * Closed capability vocabulary, version 1. Mapping from the Desktop Agent's `deviceCapabilities()` booleans:
 * `desktop` -> 'desktop', `filesystem` -> 'filesystem', `processes` -> 'processes', `secureStorage` -> 'secure-storage'.
 * The rest are declared ahead of the features that report them: 'windows-system', 'network-tools', 'local-ai',
 * 'collab-host' and 'hub-host'. Adding a value is additive; removing or renaming one needs a new vocabulary version.
 */
export const DEVICE_CAPABILITIES = [
  'desktop', 'filesystem', 'processes', 'secure-storage', 'windows-system', 'network-tools', 'local-ai', 'collab-host', 'hub-host',
] as const;
export type DeviceCapability = (typeof DEVICE_CAPABILITIES)[number];
export const DEVICE_CAPABILITIES_MAX = 16;

const Uuid = Type.String({ pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' });
const DisplayName = Type.String({ minLength: 1, maxLength: 64 });
const Platform = Type.Unsafe<DeviceRegistryPlatform>({ type: 'string', enum: [...DEVICE_PLATFORMS] });
const Capability = Type.Unsafe<DeviceCapability>({ type: 'string', enum: [...DEVICE_CAPABILITIES] });
const Capabilities = Type.Array(Capability, { uniqueItems: true, maxItems: DEVICE_CAPABILITIES_MAX });
const Iso = Type.String();
const NullableIso = Type.Union([Iso, Type.Null()]);
/** 32 raw bytes as base64url. */
export const PUBLIC_KEY_PATTERN = '^[A-Za-z0-9_-]{43}$';
/** 64 raw bytes as base64url. */
export const SIGNATURE_PATTERN = '^[A-Za-z0-9_-]{86}$';
const Password = Type.String({ minLength: 1, maxLength: 1024 });

export const DeviceIdParams = Type.Object({ deviceId: Uuid });
export type DeviceIdParams = Static<typeof DeviceIdParams>;

// --- Pairing ---------------------------------------------------------------------------------------------------

/** Crockford base32, 8 characters = 40 bits, displayed `XXXX-XXXX`. */
export const PAIRING_CODE_PATTERN = '^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$';
export const PAIRING_CODE_TTL_MS = 10 * 60_000;
export const PAIRING_MAX_WRONG_ATTEMPTS = 5;

/** Uppercases, strips spaces and dashes, maps I/L to 1 and O to 0 (same rules as recovery codes). */
export function normalizePairingCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
}

const NORMALIZED_CODE = /^[0-9A-HJKMNP-TV-Z]{8}$/;
export const isNormalizedPairingCode = (value: string): boolean => NORMALIZED_CODE.test(value);
export const displayPairingCode = (normalized: string): string => `${normalized.slice(0, 4)}-${normalized.slice(4)}`;

export const PairingCodeRequest = Type.Object(
  { host: Type.Optional(Type.String({ minLength: 1, maxLength: 255, pattern: '^(\\[[0-9A-Fa-f:.]+\\]|[A-Za-z0-9.-]+)$' })) },
  { additionalProperties: false },
);
export type PairingCodeRequest = Static<typeof PairingCodeRequest>;

export const PairingCodeResponse = Type.Object({
  pairingCode: Type.String({ pattern: PAIRING_CODE_PATTERN }),
  pairingString: Type.String(),
  expiresAt: Iso,
  hubUrl: Type.String(),
  spkiSha256: Type.String({ pattern: '^[A-Za-z0-9_-]{43}$' }),
});
export type PairingCodeResponse = Static<typeof PairingCodeResponse>;

export interface PairingStringParts {
  /** A DNS name, an IPv4 literal or a bracketed IPv6 literal (`[::1]`). */
  host: string;
  port: number;
  /** Normalized, without the dash. */
  code: string;
  spkiSha256: string;
}

export const PAIRING_STRING_PREFIX = 'dude-pair:v1:';
const PAIRING_STRING = /^dude-pair:v1:(\[[0-9A-Fa-f:.]+\]|[A-Za-z0-9.-]+):(\d{1,5}):([0-9A-HJKMNP-TV-Z]{8}):([A-Za-z0-9_-]{43})$/;

/** `dude-pair:v1:<host>:<port>:<CODE-WITHOUT-DASH>:<spkiSha256>`. A bare IPv6 literal gets its brackets. */
export function formatPairingString(parts: PairingStringParts): string {
  const host = parts.host.includes(':') && !parts.host.startsWith('[') ? `[${parts.host}]` : parts.host;
  const code = normalizePairingCode(parts.code);
  return `${PAIRING_STRING_PREFIX}${host}:${parts.port}:${code}:${parts.spkiSha256}`;
}

/** Returns null for anything malformed (bad prefix/version, port out of range, bad code or pin). */
export function parsePairingString(input: string): PairingStringParts | null {
  const match = PAIRING_STRING.exec(input.trim());
  if (match === null) return null;
  const port = Number(match[2]);
  if (!Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host: match[1]!, port, code: match[3]!, spkiSha256: match[4]! };
}

// --- Enrollment -------------------------------------------------------------------------------------------------

export const EnrollDevice = Type.Object(
  {
    deviceId: Uuid,
    displayName: DisplayName,
    platform: Platform,
    appVersion: Type.String({ minLength: 1, maxLength: 64 }),
    protocolVersion: Type.Integer({ minimum: 1 }),
    capabilities: Capabilities,
  },
  { additionalProperties: false },
);
export type EnrollDevice = Static<typeof EnrollDevice>;

export const EnrollRequest = Type.Object(
  {
    pairingCode: Type.String({ minLength: 8, maxLength: 16 }),
    device: EnrollDevice,
    publicKey: Type.String({ pattern: PUBLIC_KEY_PATTERN }),
    signature: Type.String({ pattern: SIGNATURE_PATTERN }),
  },
  { additionalProperties: false },
);
export type EnrollRequest = Static<typeof EnrollRequest>;

export const EnrollResponse = Type.Object({
  deviceId: Uuid,
  environmentId: Type.String(),
  hubInstanceId: Type.String(),
  keyId: Type.String(),
  registeredAt: Iso,
  hubRevision: Type.Integer({ minimum: 0 }),
});
export type EnrollResponse = Static<typeof EnrollResponse>;

/** Message the device signs with its new key: `dude-enroll:v1|<hubInstanceId>|<NORMALIZEDCODE>|<deviceId>|<publicKeyB64url>`. */
export function enrollMessage(input: { hubInstanceId: string; pairingCode: string; deviceId: string; publicKey: string }): string {
  return `dude-enroll:v1|${input.hubInstanceId}|${normalizePairingCode(input.pairingCode)}|${input.deviceId}|${input.publicKey}`;
}

// --- Device authentication ---------------------------------------------------------------------------------------

export const DEVICE_CHALLENGE_TTL_MS = 60_000;
export const DEVICE_TOKEN_TTL_MS = 15 * 60_000;
export const DEVICE_TOKEN_PREFIX = 'ddt_';

export const DeviceChallengeRequest = Type.Object({ deviceId: Uuid }, { additionalProperties: false });
export type DeviceChallengeRequest = Static<typeof DeviceChallengeRequest>;

export const DeviceChallengeResponse = Type.Object({ nonce: Type.String(), expiresAt: Iso });
export type DeviceChallengeResponse = Static<typeof DeviceChallengeResponse>;

export const DeviceTokenRequest = Type.Object(
  { deviceId: Uuid, nonce: Type.String({ minLength: 1, maxLength: 128 }), signature: Type.String({ pattern: SIGNATURE_PATTERN }) },
  { additionalProperties: false },
);
export type DeviceTokenRequest = Static<typeof DeviceTokenRequest>;

export const DeviceTokenResponse = Type.Object({ accessToken: Type.String({ pattern: '^ddt_[A-Za-z0-9_-]{43}$' }), expiresAt: Iso });
export type DeviceTokenResponse = Static<typeof DeviceTokenResponse>;

/** Message the device signs to obtain a token: `dude-device-auth:v1|<hubInstanceId>|<nonce>|<deviceId>`. */
export function deviceAuthMessage(input: { hubInstanceId: string; nonce: string; deviceId: string }): string {
  return `dude-device-auth:v1|${input.hubInstanceId}|${input.nonce}|${input.deviceId}`;
}

// --- Device-assisted owner recovery (PD-029) ----------------------------------------------------------------------

export const OWNER_RECOVERY_CHALLENGE_PURPOSE = 'owner-recovery';
/** Desktop platforms that may be marked recovery-trusted. */
export const OWNER_RECOVERY_PLATFORMS = ['windows', 'macos', 'linux'] as const;

export const DeviceRecoveryChallengeResponse = Type.Object({ nonce: Type.String(), expiresAt: Iso });
export type DeviceRecoveryChallengeResponse = Static<typeof DeviceRecoveryChallengeResponse>;

export const DeviceRecoveryRequest = Type.Object(
  { nonce: Type.String({ minLength: 1, maxLength: 128 }), signature: Type.String({ pattern: SIGNATURE_PATTERN }), newPassword: Type.String({ minLength: 12, maxLength: 1024 }) },
  { additionalProperties: false },
);
export type DeviceRecoveryRequest = Static<typeof DeviceRecoveryRequest>;

/** Message the recovery-trusted device signs: `dude-owner-recovery:v1|<hubInstanceId>|<nonce>|<deviceId>`. */
export function ownerRecoveryMessage(input: { hubInstanceId: string; nonce: string; deviceId: string }): string {
  return `dude-owner-recovery:v1|${input.hubInstanceId}|${input.nonce}|${input.deviceId}`;
}

// --- Registry views ----------------------------------------------------------------------------------------------

export const DeviceInfo = Type.Object({
  deviceId: Uuid,
  displayName: Type.String(),
  platform: Platform,
  appVersion: Type.String(),
  protocolVersion: Type.Integer(),
  capabilities: Type.Array(Capability),
  registeredAt: Iso,
  lastSeenAt: NullableIso,
  revokedAt: NullableIso,
  unenrolledAt: NullableIso,
  recoveryTrusted: Type.Boolean(),
  /** Always false until the realtime channel lands. */
  online: Type.Boolean(),
  /** True for the device bound to the caller's bearer session (or the calling device itself). */
  current: Type.Boolean(),
});
export type DeviceInfo = Static<typeof DeviceInfo>;

export const DeviceListResponse = Type.Array(DeviceInfo);
export type DeviceListResponse = Static<typeof DeviceListResponse>;

export const DeviceRenameRequest = Type.Object({ displayName: DisplayName }, { additionalProperties: false });
export type DeviceRenameRequest = Static<typeof DeviceRenameRequest>;

export const RecoveryTrustRequest = Type.Object({ password: Password, trusted: Type.Boolean() }, { additionalProperties: false });
export type RecoveryTrustRequest = Static<typeof RecoveryTrustRequest>;

export const DeviceSelfUpdate = Type.Object(
  {
    displayName: Type.Optional(DisplayName),
    appVersion: Type.Optional(Type.String({ minLength: 1, maxLength: 64 })),
    protocolVersion: Type.Optional(Type.Integer({ minimum: 1 })),
    capabilities: Type.Optional(Capabilities),
  },
  { additionalProperties: false },
);
export type DeviceSelfUpdate = Static<typeof DeviceSelfUpdate>;

export const OwnerBearerRequest = Type.Object({ password: Password }, { additionalProperties: false });
export type OwnerBearerRequest = Static<typeof OwnerBearerRequest>;

export const OwnerBearerResponse = Type.Object({
  accessToken: Type.String({ pattern: '^dob_[A-Za-z0-9_-]{43}$' }),
  /** The hard (absolute) expiry; the idle expiry slides to a shorter horizon on use. */
  expiresAt: Iso,
  owner: Type.Object({ ownerId: Type.String(), displayName: Type.String() }),
});
export type OwnerBearerResponse = Static<typeof OwnerBearerResponse>;
