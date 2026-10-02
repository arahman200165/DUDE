import Type, { type Static } from 'typebox';
import { RECOVERY_CODE_COUNT, RECOVERY_CODE_PATTERN } from './bootstrap.schema.js';

export const SESSION_KINDS = ['cookie', 'bearer'] as const;
export type SessionKind = (typeof SESSION_KINDS)[number];

const Password = Type.String({ minLength: 1, maxLength: 1024 });
const NewPassword = Type.String({ minLength: 12, maxLength: 1024 });

export const SignInRequest = Type.Object({ password: Password }, { additionalProperties: false });
export type SignInRequest = Static<typeof SignInRequest>;

/** Public view of a session: `sessionId` is the first 16 hex characters of the stored hash, never the credential. */
export const SessionInfo = Type.Object({
  sessionId: Type.String(),
  kind: Type.Union([Type.Literal('cookie'), Type.Literal('bearer')]),
  createdAt: Type.String(),
  lastActiveAt: Type.String(),
  idleExpiresAt: Type.String(),
  absoluteExpiresAt: Type.String(),
  current: Type.Boolean(),
  userAgent: Type.Union([Type.String(), Type.Null()]),
  ip: Type.Union([Type.String(), Type.Null()]),
  deviceId: Type.Union([Type.String(), Type.Null()]),
});
export type SessionInfo = Static<typeof SessionInfo>;

export const SignInResponse = Type.Object({
  csrfToken: Type.String(),
  session: SessionInfo,
  owner: Type.Object({ ownerId: Type.String(), displayName: Type.String(), remainingRecoveryCodes: Type.Integer({ minimum: 0 }) }),
});
export type SignInResponse = Static<typeof SignInResponse>;

export const CurrentSessionResponse = SignInResponse;
export type CurrentSessionResponse = SignInResponse;

export const RecoverRequest = Type.Object(
  { recoveryCode: Type.String({ minLength: 10, maxLength: 32 }), newPassword: NewPassword },
  { additionalProperties: false },
);
export type RecoverRequest = Static<typeof RecoverRequest>;

export const ChangePasswordRequest = Type.Object({ currentPassword: Password, newPassword: NewPassword }, { additionalProperties: false });
export type ChangePasswordRequest = Static<typeof ChangePasswordRequest>;

export const RecoveryCodesResponse = Type.Object({
  recoveryCodes: Type.Array(Type.String({ pattern: RECOVERY_CODE_PATTERN }), { minItems: RECOVERY_CODE_COUNT, maxItems: RECOVERY_CODE_COUNT }),
});
export type RecoveryCodesResponse = Static<typeof RecoveryCodesResponse>;

/** Step one of a destructive Hub action: nothing has changed yet. The token is single-use and short-lived. */
export const ConfirmPreview = Type.Object({
  confirmToken: Type.String(),
  expiresAt: Type.String(),
  summary: Type.Object(
    { action: Type.String(), affectedSessions: Type.Optional(Type.Integer({ minimum: 0 })), remainingRecoveryCodes: Type.Optional(Type.Integer({ minimum: 0 })) },
    { additionalProperties: true },
  ),
});
export type ConfirmPreview = Static<typeof ConfirmPreview>;

export const ConfirmApply = Type.Object({ confirmToken: Type.String({ minLength: 1, maxLength: 256 }) }, { additionalProperties: false });
export type ConfirmApply = Static<typeof ConfirmApply>;

export const OwnerResetRequest = Type.Object(
  { resetToken: Type.String({ pattern: '^[A-Za-z0-9_-]{43}$' }), newPassword: NewPassword },
  { additionalProperties: false },
);
export type OwnerResetRequest = Static<typeof OwnerResetRequest>;

export const OwnerResetResponse = RecoveryCodesResponse;
export type OwnerResetResponse = RecoveryCodesResponse;

export const OkResponse = Type.Object({ ok: Type.Literal(true) });
export type OkResponse = Static<typeof OkResponse>;

export const SessionListResponse = Type.Array(SessionInfo);
export type SessionListResponse = Static<typeof SessionListResponse>;

export const SessionIdParams = Type.Object({ sessionId: Type.String({ pattern: '^[0-9a-f]{16}$' }) });
export type SessionIdParams = Static<typeof SessionIdParams>;
