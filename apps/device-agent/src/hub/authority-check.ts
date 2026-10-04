import type { AgentHubAuthorityReason } from '@dude/contracts';

export interface EnrolledAuthority {
  hubInstanceId: string;
  /** The highest epoch this device has seen. */
  authorityEpoch: number;
}

/** What one Hub answer reported; every field is optional (a message only carries the epoch, an older Hub reports none). */
export interface SeenAuthority {
  hubInstanceId?: string | undefined;
  authorityEpoch?: number | undefined;
  authorityState?: 'active' | 'transferred' | undefined;
}

export type AuthorityVerdict =
  | { kind: 'ok'; epoch: number }
  | { kind: 'changed'; reason: AgentHubAuthorityReason; hubInstanceId: string | null; epoch: number | null };

/**
 * PD-073: is the Hub that answered still the authority this device enrolled with? Pure. A different instance id wins over a
 * retired Hub, which wins over a lower epoch. An absent epoch reads as "unchanged" (an older Hub), never as a regression.
 */
export function evaluateAuthority(enrolled: EnrolledAuthority, seen: SeenAuthority): AuthorityVerdict {
  const epoch = seen.authorityEpoch ?? null;
  const instance = seen.hubInstanceId ?? null;
  if (instance !== null && instance !== enrolled.hubInstanceId) return { kind: 'changed', reason: 'instance-changed', hubInstanceId: instance, epoch };
  if (seen.authorityState === 'transferred') return { kind: 'changed', reason: 'transferred', hubInstanceId: instance, epoch };
  if (epoch !== null && epoch < enrolled.authorityEpoch) return { kind: 'changed', reason: 'epoch-lower', hubInstanceId: instance, epoch };
  return { kind: 'ok', epoch: Math.max(epoch ?? enrolled.authorityEpoch, enrolled.authorityEpoch) };
}
