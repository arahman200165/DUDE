import { createStorageBackend } from '../persistence/storage-backend';
import { buildConsentKey, buildStorageKey } from "@dude/tool-engine/core/persistence/persistence-keys";

type BridgePolicy = 'session' | 'local' | 'user-choice';

const local = createStorageBackend('local');
const session = createStorageBackend('session');

/**
 * Reads/writes a tool's own `PersistenceService`-managed storage keys directly, without going
 * through a live `PersistenceService.signal()` instance — there usually isn't one to poke, since
 * signals aren't memoized per key. A `<id>.workspace-step.ts` adapter uses this to read the tool's
 * current value for `snapshot()`, and to write a restored value back before the tool component
 * (re)mounts, so that when the component's constructor calls its own `persistence.signal(...)`, it
 * reads the just-written value on its normal synchronous storage read at construction time — the
 * same `dude:v1:<toolId>:<key>` keys the tool's own code already uses.
 *
 * Only `'session'`/`'local'`/`'user-choice'` are supported here — `'none'`-policy tools never
 * touch storage at all (use `WorkspaceHandoffService` instead, once it ships) and `'secure-local'`
 * is async/OS-keychain-only (`SecureLocalService`), out of scope for this synchronous bridge.
 */
function resolveBackend(toolId: string, key: string, policy: BridgePolicy) {
  if (policy === 'user-choice') {
    const consented = local.get(buildConsentKey(toolId, key)) === 'true';
    return consented ? local : session;
  }
  return policy === 'local' ? local : session;
}

export function readStorageValue<T>(toolId: string, key: string, policy: BridgePolicy): T | undefined {
  const raw = resolveBackend(toolId, key, policy).get(buildStorageKey(toolId, key));
  if (raw === null) return undefined;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export function writeStorageValue<T>(toolId: string, key: string, policy: BridgePolicy, value: T): void {
  resolveBackend(toolId, key, policy).set(buildStorageKey(toolId, key), JSON.stringify(value));
}
