import { argon2, randomBytes, timingSafeEqual } from 'node:crypto';

export const PASSWORD_MIN_CODE_POINTS = 12;
export const PASSWORD_MAX_CODE_POINTS = 256;

export interface PasswordParams { v: 1; m: number; t: number; p: number; len: number }

/** Argon2id: 64 MiB, 3 passes, 1 lane, 32-byte tag. Stored with each hash so they can be raised later. */
export const DEFAULT_PASSWORD_PARAMS: PasswordParams = { v: 1, m: 65536, t: 3, p: 1, len: 32 };

export interface StoredPassword {
  paramsJson: string;
  salt: Buffer;
  hash: Buffer;
}

function derive(password: string, salt: Uint8Array, params: PasswordParams): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    argon2(
      'argon2id',
      { message: Buffer.from(password.normalize('NFKC'), 'utf8'), nonce: salt, parallelism: params.p, tagLength: params.len, memory: params.m, passes: params.t },
      (error, key) => (error ? reject(error) : resolve(Buffer.from(key))),
    );
  });
}

/** `params` exists so specs can use cheap settings; production callers never pass it. */
export async function hashPassword(password: string, params: PasswordParams = DEFAULT_PASSWORD_PARAMS): Promise<StoredPassword> {
  const salt = randomBytes(16);
  const hash = await derive(password, salt, params);
  return { paramsJson: JSON.stringify({ v: params.v, m: params.m, t: params.t, p: params.p, len: params.len }), salt, hash };
}

function parseParams(json: string): PasswordParams | null {
  try {
    const x = JSON.parse(json) as Partial<PasswordParams>;
    if (x.v !== 1 || ![x.m, x.t, x.p, x.len].every((n) => typeof n === 'number' && Number.isInteger(n) && n > 0)) return null;
    return x as PasswordParams;
  } catch {
    return null;
  }
}

export async function verifyPassword(password: string, stored: StoredPassword): Promise<boolean> {
  const params = parseParams(stored.paramsJson);
  if (params === null) return false;
  const candidate = await derive(password, stored.salt, params);
  return candidate.length === stored.hash.length && timingSafeEqual(candidate, stored.hash);
}

export type PasswordPolicyReason = 'too-short' | 'too-long' | 'blank';
export type PasswordPolicyResult = { ok: true } | { ok: false; reason: PasswordPolicyReason };

/** 12 to 256 code points after NFKC normalization, and not all whitespace. */
export function validateOwnerPassword(password: string): PasswordPolicyResult {
  const normalized = password.normalize('NFKC');
  if (/^\s*$/u.test(normalized)) return { ok: false, reason: 'blank' };
  const length = [...normalized].length;
  if (length < PASSWORD_MIN_CODE_POINTS) return { ok: false, reason: 'too-short' };
  if (length > PASSWORD_MAX_CODE_POINTS) return { ok: false, reason: 'too-long' };
  return { ok: true };
}
