import type { SyncStatus } from './status.js';

export type SyncIndicatorKind = 'synced' | 'syncing' | 'pending' | 'offline' | 'paused' | 'conflicts' | 'needs-first-sync' | 'revoked' | 'attention';

export interface SyncDisplay {
  readonly kind: SyncIndicatorKind;
  /** Short text for the compact indicator. */
  readonly label: string;
  /** Sentence for the tooltip / accessible description. */
  readonly detail: string;
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`;

/** Compact, prioritized summary of a sync status. Null when this device is standalone (nothing to show). */
export function describeSync(status: SyncStatus | null): SyncDisplay | null {
  if (status === null || status.phase === 'standalone') return null;
  switch (status.phase) {
    case 'revoked':
      return { kind: 'revoked', label: 'Revoked', detail: 'This device was revoked by the Hub. Sync is stopped and your data is kept.' };
    case 'needs-first-sync':
      return { kind: 'needs-first-sync', label: 'Set up sync', detail: 'Review what will sync before this device starts syncing.' };
    case 'hub-outdated':
      return { kind: 'attention', label: 'Hub update needed', detail: 'The Hub is too old to sync with this version of DUDE.' };
    case 'error':
      return { kind: 'attention', label: 'Sync error', detail: status.lastError ?? 'Sync hit an error.' };
    case 'paused':
      return { kind: 'paused', label: 'Paused', detail: 'Sync is paused. Changes are saved on this device.' };
    case 'offline':
      return {
        kind: 'offline', label: 'Offline',
        detail: `The Hub cannot be reached.${status.pending > 0 ? ` ${plural(status.pending, 'change')} will send when it returns.` : ''}`,
      };
    default:
      break;
  }
  if (status.conflicts > 0) {
    return { kind: 'conflicts', label: plural(status.conflicts, 'conflict'), detail: 'Some items changed on two devices and need your decision.' };
  }
  if (status.phase === 'syncing') return { kind: 'syncing', label: 'Syncing', detail: 'Syncing with the Hub.' };
  if (status.pending > 0) return { kind: 'pending', label: `${status.pending} pending`, detail: `${plural(status.pending, 'change')} waiting to sync.` };
  return { kind: 'synced', label: 'Synced', detail: 'Everything on this device is synced.' };
}
