/** Hub registration handshake shapes. Unused until Phase 31C; defined now so identity can be stable. */
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
