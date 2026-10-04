/**
 * "This Hub was transferred" (PD-071), noticed at the one place every Hub HTTP call passes through: the fetch transport.
 * The browser's Hub web runtime subscribes once and locks the page; nothing else needs to know which call saw it. A plain
 * module-level notifier because the transport is created outside Angular's injector (boot code and the admin adapter).
 */
const listeners = new Set<() => void>();
let seen = false;

/** True once any Hub call answered `hub-transferred` in this page's lifetime. */
export const hubTransferredSeen = (): boolean => seen;

export function noteHubTransferred(): void {
  seen = true;
  for (const listener of [...listeners]) listener();
}

/** Subscribes to the signal; a listener added after it fired is called at once. Returns the unsubscribe. */
export function onHubTransferred(listener: () => void): () => void {
  listeners.add(listener);
  if (seen) listener();
  return () => listeners.delete(listener);
}

/** Test seam: forgets a previous signal. */
export function resetHubTransferredSignal(): void {
  seen = false;
  listeners.clear();
}

/** The Hub's error envelope for a transferred Hub: HTTP 503 with `error.code` `hub-transferred`. */
export function isTransferredResponse(status: number, body: unknown): boolean {
  if (status !== 503 || typeof body !== 'object' || body === null) return false;
  const error = (body as { error?: unknown }).error;
  return typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'hub-transferred';
}
