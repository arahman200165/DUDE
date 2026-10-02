import { createHash, randomBytes } from 'node:crypto';
import { transaction } from '@dude/sqlite-store';
import type { Db } from '@dude/sqlite-store';
import { RECOVERY_CODE_COUNT } from '@dude/contracts/hub';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32

/** One code: 50 random bits as 10 Crockford characters, shown `XXXXX-XXXXX`. */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(10);
  let out = '';
  for (let i = 0; i < 10; i++) out += ALPHABET[bytes[i]! & 31];
  return `${out.slice(0, 5)}-${out.slice(5)}`;
}

/** Uppercases, strips spaces and dashes, maps I/L to 1 and O to 0. */
export function normalizeRecoveryCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
}

export const hashRecoveryCode = (input: string): string => createHash('sha256').update(normalizeRecoveryCode(input)).digest('hex');

/** Replaces the owner's codes with a new generation and returns the plaintext, which is never stored. */
export function replaceRecoveryCodes(db: Db, ownerId: string, now: number): string[] {
  return transaction(db, () => {
    const row = db.prepare('SELECT MAX(generation) AS g FROM recovery_codes WHERE owner_id = ?').get(ownerId) as { g: number | null } | undefined;
    const generation = (row?.g ?? 0) + 1;
    db.prepare('DELETE FROM recovery_codes WHERE owner_id = ?').run(ownerId);
    const insert = db.prepare('INSERT INTO recovery_codes(code_hash, owner_id, generation, created_at, used_at) VALUES(?, ?, ?, ?, NULL)');
    const seen = new Set<string>();
    const codes: string[] = [];
    while (codes.length < RECOVERY_CODE_COUNT) {
      const code = generateRecoveryCode();
      const hash = hashRecoveryCode(code);
      if (seen.has(hash)) continue;
      seen.add(hash);
      insert.run(hash, ownerId, generation, new Date(now).toISOString());
      codes.push(code);
    }
    return codes;
  });
}

/** Marks the matching unused code used in one statement; false when it is unknown or already used. */
export function consumeRecoveryCode(db: Db, ownerId: string, code: string, now: number): boolean {
  const result = db
    .prepare('UPDATE recovery_codes SET used_at = ? WHERE code_hash = ? AND owner_id = ? AND used_at IS NULL')
    .run(new Date(now).toISOString(), hashRecoveryCode(code), ownerId);
  return Number(result.changes) === 1;
}
