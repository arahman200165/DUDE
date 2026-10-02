/**
 * Early (31B) registration handshake shapes, kept for compatibility. The authoritative Hub wire contract is
 * `EnrollRequest`/`EnrollResponse` in `../hub/devices.schema.ts` (closed capability array; the Ed25519 public key and
 * a possession signature are mandatory there).
 */
export interface DeviceRegistrationRequest {
  deviceId: string;
  displayName: string;
  platform: string;
  appVersion: string;
  capabilities: Record<string, boolean>;
  publicKey?: string;
}

export interface DeviceRegistrationResponse {
  deviceId: string;
  environmentId: string;
  /** ISO-8601. */
  registeredAt: string;
  hubRevision: number;
}
