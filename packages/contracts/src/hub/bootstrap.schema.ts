import Type, { type Static } from 'typebox';

/** One Crockford-base32 recovery code, shown as two groups of five. */
export const RECOVERY_CODE_PATTERN = '^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$';
export const RECOVERY_CODE_COUNT = 10;

export const BootstrapRequest = Type.Object(
  {
    /** The one-time setup token: 32 random bytes, base64url. */
    setupToken: Type.String({ pattern: '^[A-Za-z0-9_-]{43}$' }),
    ownerDisplayName: Type.String({ minLength: 1, maxLength: 64 }),
    environmentName: Type.String({ minLength: 1, maxLength: 64 }),
    password: Type.String({ minLength: 12, maxLength: 1024 }),
  },
  { additionalProperties: false },
);
export type BootstrapRequest = Static<typeof BootstrapRequest>;

export const BootstrapResponse = Type.Object({
  environmentId: Type.String(),
  ownerId: Type.String(),
  recoveryCodes: Type.Array(Type.String({ pattern: RECOVERY_CODE_PATTERN }), { minItems: RECOVERY_CODE_COUNT, maxItems: RECOVERY_CODE_COUNT }),
});
export type BootstrapResponse = Static<typeof BootstrapResponse>;
