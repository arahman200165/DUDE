import Type, { type Static } from 'typebox';

export const HUB_ERROR_CODES = [
  'bad-request', 'unauthorized', 'forbidden', 'not-found', 'conflict',
  'rate-limited', 'locked', 'step-up-required', 'unsupported-protocol', 'payload-too-large', 'internal',
] as const;
export type HubErrorCode = (typeof HUB_ERROR_CODES)[number];

export const ErrorEnvelope = Type.Object({
  error: Type.Object({ code: Type.String(), message: Type.String() }),
});
export type ErrorEnvelope = Static<typeof ErrorEnvelope>;

export function isHubErrorCode(code: string): code is HubErrorCode {
  return (HUB_ERROR_CODES as readonly string[]).includes(code);
}
