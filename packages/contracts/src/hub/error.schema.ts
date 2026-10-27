import Type, { type Static } from 'typebox';

export const HUB_ERROR_CODES = [
  'bad-request', 'unauthorized', 'forbidden', 'not-found', 'conflict',
  'rate-limited', 'locked', 'step-up-required', 'unsupported-protocol', 'payload-too-large', 'internal',
  /** HTTP 503: the Hub was transferred to another machine and is read-only (PD-071). */
  'hub-transferred',
  /** HTTP 503: Google sign-in cannot serve this request (provider unreachable, secret missing, not configured); the password still works (PD-121). */
  'oidc-unavailable',
  /** HTTP 507: the Hub's free-disk guard refused an upload (the volume is too full to take it safely). Nothing was written; retry after freeing space. */
  'storage-full',
] as const;
export type HubErrorCode = (typeof HUB_ERROR_CODES)[number];

export const ErrorEnvelope = Type.Object({
  error: Type.Object({ code: Type.String(), message: Type.String() }),
});
export type ErrorEnvelope = Static<typeof ErrorEnvelope>;

export function isHubErrorCode(code: string): code is HubErrorCode {
  return (HUB_ERROR_CODES as readonly string[]).includes(code);
}
