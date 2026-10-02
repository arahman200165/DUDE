import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

export const CONFIRMATION_TTL_MS = 60_000;
const MAX_PENDING = 1000;

interface Staged { action: string; digest: string; bindingId: string; expires: number }

const sha256 = (text: string): Buffer => createHash('sha256').update(text).digest();
const equal = (a: string, b: string): boolean => timingSafeEqual(sha256(a), sha256(b));

export interface IssueInput { action: string; digest: string; bindingId: string; now: number }
export interface ConsumeInput extends IssueInput { token: string }

/**
 * Server-side two-step confirmation for destructive Hub actions (semantics of the desktop ConfirmationStore).
 * `bindingId` is the session hash, or 'cli' for admin-channel actions. Only the SHA-256 of a token is kept.
 * A token is single-use: it is deleted on any consume attempt, successful or not.
 */
export class ConfirmationStore {
  private readonly staged = new Map<string, Staged>();

  get pending(): number { return this.staged.size; }

  private sweep(now: number): void {
    for (const [hash, value] of this.staged) if (value.expires < now) this.staged.delete(hash);
  }

  issue(input: IssueInput): string {
    this.sweep(input.now);
    if (this.staged.size >= MAX_PENDING) throw new Error('Too many pending confirmations.');
    const token = randomBytes(32).toString('base64url');
    this.staged.set(sha256(token).toString('hex'), {
      action: input.action, digest: input.digest, bindingId: input.bindingId, expires: input.now + CONFIRMATION_TTL_MS,
    });
    return token;
  }

  consume(input: ConsumeInput): boolean {
    if (typeof input.token !== 'string' || input.token.length === 0) return false;
    const hash = sha256(input.token).toString('hex');
    const value = this.staged.get(hash);
    this.staged.delete(hash);
    if (value === undefined) return false;
    const fieldsMatch = [equal(value.action, input.action), equal(value.digest, input.digest), equal(value.bindingId, input.bindingId)];
    return fieldsMatch.every(Boolean) && value.expires >= input.now;
  }
}
