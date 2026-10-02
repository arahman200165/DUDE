import { sysHelper, stopSysHelper } from '../sys-helper';

/**
 * User-presence gate for device-assisted owner recovery (PD-029): Windows Hello with a CredUI fallback, run by the
 * `user-consent` method of `windows-sys.exe` against the calling window's handle. Honest limit: this is a client-side UI
 * gate the Hub cannot verify. The helper method is not in `SYS_READ_METHODS`; only this module calls it.
 */
export type ConsentOutcome =
  | { readonly status: 'verified'; readonly method: 'hello' | 'credui' }
  | { readonly status: 'denied'; readonly reason: string }
  | { readonly status: 'unavailable' };

export type UserConsent = (hwnd: string, message: string) => Promise<ConsentOutcome>;

/** A prompt can wait for a person, so the helper call gets a long budget. */
export const USER_CONSENT_TIMEOUT_MS = 120_000;

interface HelperLike {
  call(method: string, params: unknown, timeoutMs?: number): Promise<{ ok: true; data: unknown } | { ok: false; error: string }>;
}

const NOT_INSTALLED = 'not installed';
const TIMED_OUT = 'timed out';

export async function requestUserConsent(
  hwnd: string,
  message: string,
  helper: HelperLike = sysHelper(),
  platform: NodeJS.Platform = process.platform,
  onTimeout: () => void = stopSysHelper,
): Promise<ConsentOutcome> {
  if (platform !== 'win32') return { status: 'unavailable' };
  const result = await helper.call('user-consent', { hwnd, message }, USER_CONSENT_TIMEOUT_MS);
  if (!result.ok) {
    if (result.error.includes(NOT_INSTALLED)) return { status: 'unavailable' };
    if (result.error.includes(TIMED_OUT)) {
      // The helper's single RPC thread is stuck on the prompt: drop it so the next call starts a fresh one.
      onTimeout();
      return { status: 'denied', reason: 'timeout' };
    }
    return { status: 'denied', reason: 'helper-error' };
  }
  const data = result.data as { verified?: unknown; method?: unknown; reason?: unknown } | null;
  if (data?.verified === true && (data.method === 'hello' || data.method === 'credui')) return { status: 'verified', method: data.method };
  return { status: 'denied', reason: typeof data?.reason === 'string' && /^[a-z0-9 -]{1,48}$/.test(data.reason) ? data.reason : 'not-verified' };
}
