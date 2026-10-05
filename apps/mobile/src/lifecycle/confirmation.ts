import type { ConsequenceClass } from '@dude/domain/shared/models/tool-metadata.model';

export type LifecycleAction = 'use-hub' | 'disconnect' | 'clear-cache' | 'discard-attempt' | 'continue-standalone';
/** Core settings actions have no tool manifest; keep their consequence contract explicit. */
export const MOBILE_LIFECYCLE_CONSEQUENCES = {
  'use-hub': ['database-write'],
  disconnect: ['database-write', 'secret-management', 'remote-write'],
  'clear-cache': ['database-write'],
  'discard-attempt': ['database-write', 'secret-management'],
  'continue-standalone': ['database-write'],
} as const satisfies Record<LifecycleAction, readonly ConsequenceClass[]>;

export interface ConfirmationState {
  readonly contextId: string;
  readonly localRevision: number;
  readonly pending: number;
  readonly records: number;
  /** Category choices, staged snapshot and enrollment identity are part of the binding. */
  readonly detail: string;
}
interface Permit { readonly action: LifecycleAction; readonly digest: string; readonly expiresAt: number }
export class MobileConfirmationBoundary {
  private readonly permits = new Map<string, Permit>();
  constructor(private readonly id: () => string, private readonly now: () => number) {}
  issue(action: LifecycleAction, state: ConfirmationState): string {
    for (const [token, permit] of this.permits) if (permit.expiresAt <= this.now()) this.permits.delete(token);
    const token = this.id();
    this.permits.set(token, { action, digest: JSON.stringify(state), expiresAt: this.now() + 60_000 });
    return token;
  }
  consume(token: string, action: LifecycleAction, state: ConfirmationState): void {
    const permit = this.permits.get(token);
    this.permits.delete(token);
    if (!permit || permit.action !== action || permit.expiresAt <= this.now() || permit.digest !== JSON.stringify(state)) {
      throw new Error('This confirmation is stale, expired or already used. Review a fresh preview before confirming.');
    }
  }
}
