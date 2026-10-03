/** Hub wire-protocol constants. Compatibility is decided by these integers, never by app version. */
export const HUB_PROTOCOL_VERSION = 2;
export const HUB_MIN_CLIENT_PROTOCOL = 1;
export const HUB_API_PREFIX = '/api/v1';
export const HUB_DEFAULT_PORT = 47600;
export const HUB_SERVICE_ID = 'dude-hub';

/** Synchronization (31D) needs Hub protocol 2; an Agent talking to a protocol-1 Hub reports hub-outdated. */
export const HUB_SYNC_MIN_PROTOCOL = 2;
export function hubSupportsSync(protocolVersion: number): boolean {
  return protocolVersion >= HUB_SYNC_MIN_PROTOCOL;
}
