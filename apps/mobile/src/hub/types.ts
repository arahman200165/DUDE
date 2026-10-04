import type { HubClient, HubTransport } from '@dude/api-client';

/** Only opaque references cross the native identity boundary. */
export interface MobileSigner {
  prepareKey(scope: { environmentId: string; installId: string }): Promise<string>;
  publicKey(keyRef: string): Promise<string>;
  signEnrollment(keyRef: string, hubInstanceId: string, pairingCode: string, deviceId: string): Promise<string>;
  signChallenge(keyRef: string, hubInstanceId: string, nonce: string, deviceId: string): Promise<string>;
  deleteKey(keyRef: string): Promise<void>;
  randomBytes(length: number): Promise<string>;
}
export interface MobileHubTarget { readonly hubUrl: string; readonly pins: readonly string[] }
export interface MobileHubEnrollment extends MobileHubTarget {
  readonly deviceId: string;
  readonly environmentId: string;
  readonly hubInstanceId: string;
  readonly authorityEpoch: number;
  readonly keyRef: string;
  readonly publicKey: string;
  /** The lost-ack recovery endpoint does not expose the registry key id. Authentication uses keyRef instead. */
  readonly keyId: string | null;
  readonly registeredAt: string;
  readonly spkiActive: string;
  readonly spkiNext: string | null;
  readonly proxySpkis: readonly string[];
}
/** Durable recovery receipt written BEFORE enroll. Never contains a code, signature, token or request body. */
export interface MobileEnrollmentAttempt extends MobileHubTarget {
  readonly deviceId: string;
  readonly environmentId: string;
  readonly hubInstanceId: string;
  readonly authorityEpoch: number;
  readonly keyRef: string;
  readonly publicKey: string;
  readonly displayName: string;
  readonly mode: 'enroll' | 'reconnect';
  readonly createdAt: string;
  readonly spkiActive: string;
  readonly spkiNext: string | null;
  readonly proxySpkis: readonly string[];
}
/** The durable owner implements atomic enrollment/pending receipt replacement; this layer owns no database. */
export interface MobileHubPersistence {
  readEnrollment(): Promise<MobileHubEnrollment | null>;
  readPendingAttempt(): Promise<MobileEnrollmentAttempt | null>;
  savePendingAttempt(attempt: MobileEnrollmentAttempt): Promise<void>;
  commitEnrollment(enrollment: MobileHubEnrollment): Promise<void>;
  saveEnrollment(enrollment: MobileHubEnrollment): Promise<void>;
  clearPendingAttempt(): Promise<void>;
}
export interface MobileHubPorts {
  readonly signer: MobileSigner;
  readonly persistence: MobileHubPersistence;
  readonly transport: (target: MobileHubTarget) => HubTransport;
  readonly certificatePin: (pem: string) => Promise<string>;
  readonly now?: () => number;
}
export type MobileApiFactory = (target: MobileHubTarget) => HubClient;
export class MobileHubError extends Error {
  constructor(readonly code: 'invalid-pairing' | 'incompatible' | 'authority-changed' | 'pin-mismatch' | 'revoked' | 'key-unavailable' | 'key-rejected' | 'pairing-input-required' | 'pending-attempt' | 'already-enrolled' | 'not-enrolled', message: string) {
    super(message); this.name = 'MobileHubError';
  }
}
