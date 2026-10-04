import type { StorageBackend } from '../persistence/storage-backend';

/**
 * The browser's half of the Hub authority epoch (PD-071). A Hub reports `hubInstanceId`, `authorityEpoch` (1 when absent)
 * and `authorityState` in `hello`; a browser remembers the highest epoch it has used and refuses a Hub below it, and refuses
 * a transferred Hub outright.
 */
export interface AuthorityRecord {
  readonly hubInstanceId: string;
  readonly authorityEpoch: number;
}

/** What `hello` told this browser; every field after the instance id is optional because an older Hub predates epochs. */
export interface SeenAuthority {
  readonly hubInstanceId: string;
  readonly authorityEpoch?: number | undefined;
  readonly authorityState?: 'active' | 'transferred' | undefined;
}

export type AuthorityVerdict =
  | { readonly kind: 'ok'; /** The record to store: the seen one (the epoch never decreases for one instance). */ readonly record: AuthorityRecord }
  | { readonly kind: 'transferred' }
  | { readonly kind: 'older'; readonly storedEpoch: number; readonly seenEpoch: number };

/**
 * Pure rule. A transferred Hub is refused first. With a stored record: the same instance at a lower epoch is older, and a
 * different instance (a restore) must be strictly newer than the stored epoch, otherwise it is older too. A browser that has
 * stored nothing accepts whatever it sees.
 */
export function evaluateBrowserAuthority(stored: AuthorityRecord | null, seen: SeenAuthority): AuthorityVerdict {
  if (seen.authorityState === 'transferred') return { kind: 'transferred' };
  const seenEpoch = seen.authorityEpoch ?? 1;
  if (stored) {
    const sameInstance = stored.hubInstanceId === seen.hubInstanceId;
    if (sameInstance ? seenEpoch < stored.authorityEpoch : seenEpoch <= stored.authorityEpoch) {
      return { kind: 'older', storedEpoch: stored.authorityEpoch, seenEpoch };
    }
  }
  return { kind: 'ok', record: { hubInstanceId: seen.hubInstanceId, authorityEpoch: seenEpoch } };
}

/** Why the page cannot go on: shown as a blocking notice instead of the sign-in page or the app. */
export type HubAuthorityBlock =
  | { readonly kind: 'transferred' }
  | { readonly kind: 'older'; readonly storedEpoch: number; readonly seenEpoch: number; /** What "Forget the previous Hub" stores. */ readonly seen: AuthorityRecord };

/**
 * Where the record lives: the browser's own `localStorage` in the `__device__` namespace, next to the installation id.
 * It is declared `local-only` in `SETTING_DEFINITIONS` (`__device__:hubAuthority`), so it is never synced or exported.
 * Sign-out wipes it with the rest of the origin (`wipeHubWebOrigin` clears every `localStorage` key): that costs only the
 * downgrade guard for the next sign-in, never data, and a browser that signed out has nothing it could protect.
 */
export const AUTHORITY_STORAGE_KEY = 'dude:v1:__device__:hubAuthority';

type AuthorityStorage = Pick<StorageBackend, 'get' | 'set' | 'remove'>;

export function readAuthorityRecord(storage: AuthorityStorage): AuthorityRecord | null {
  try {
    const raw = storage.get(AUTHORITY_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as Partial<AuthorityRecord> | null;
    if (parsed && typeof parsed.hubInstanceId === 'string' && parsed.hubInstanceId !== '' && Number.isInteger(parsed.authorityEpoch) && (parsed.authorityEpoch as number) >= 1) {
      return { hubInstanceId: parsed.hubInstanceId, authorityEpoch: parsed.authorityEpoch as number };
    }
  } catch {
    // an unreadable record is treated as none
  }
  return null;
}

export function writeAuthorityRecord(storage: AuthorityStorage, record: AuthorityRecord): void {
  storage.set(AUTHORITY_STORAGE_KEY, JSON.stringify({ hubInstanceId: record.hubInstanceId, authorityEpoch: record.authorityEpoch }));
}

export type AuthorityGateResult =
  | { readonly kind: 'ok' }
  | { readonly kind: 'blocked'; readonly block: HubAuthorityBlock }
  /** `hello` failed: the ordinary boot (and its unreachable handling) decides what happens next. */
  | { readonly kind: 'unknown' };

/**
 * The boot gate: asks the Hub who it is (public `hello`, before any sign-in or attach), judges it against the stored record
 * and persists the record when the Hub is acceptable. Never throws.
 */
export async function checkBrowserAuthority(hello: () => Promise<SeenAuthority>, storage: AuthorityStorage): Promise<AuthorityGateResult> {
  let seen: SeenAuthority;
  try {
    seen = await hello();
  } catch {
    return { kind: 'unknown' };
  }
  const verdict = evaluateBrowserAuthority(readAuthorityRecord(storage), seen);
  switch (verdict.kind) {
    case 'ok':
      writeAuthorityRecord(storage, verdict.record);
      return { kind: 'ok' };
    case 'transferred':
      return { kind: 'blocked', block: { kind: 'transferred' } };
    case 'older':
      return { kind: 'blocked', block: { kind: 'older', storedEpoch: verdict.storedEpoch, seenEpoch: verdict.seenEpoch, seen: { hubInstanceId: seen.hubInstanceId, authorityEpoch: verdict.seenEpoch } } };
  }
}

/** "Forget the previous Hub and continue": the seen Hub becomes the stored one. */
export function forgetPreviousAuthority(storage: AuthorityStorage, seen: AuthorityRecord): void {
  writeAuthorityRecord(storage, seen);
}
