import path from 'node:path';

/**
 * One operation at a time per destination (Milestone 847): a backup run, a prune or a re-wrap. The Hub process is the only writer
 * of its destinations (the scheduler and the admin methods both run inside it), so an in-process lock is enough and dies with the
 * process; a crashed run's leftovers are handled by the journal, not by the lock. "Prune never runs while a backup holds the
 * destination" is this lock.
 */
export type DestinationLockHolder = 'backup' | 'prune' | 'rewrap' | 'remove';

const held = new Map<string, DestinationLockHolder>();

/** The lock key: the data root (one process may serve specs for several Hubs) and the destination id. */
export const destinationLockKey = (dataRoot: string, destinationId: string): string => `${path.resolve(dataRoot)}\u0000${destinationId}`;

/** Takes the lock; returns the release function, or the current holder when it is taken. */
export function tryLockDestination(key: string, holder: DestinationLockHolder): { release: () => void } | { heldBy: DestinationLockHolder } {
  const current = held.get(key);
  if (current !== undefined) return { heldBy: current };
  held.set(key, holder);
  let released = false;
  return {
    release: () => {
      if (released) return;
      released = true;
      if (held.get(key) === holder) held.delete(key);
    },
  };
}

export function destinationLockHolder(key: string): DestinationLockHolder | undefined {
  return held.get(key);
}
