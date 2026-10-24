import { describe, expect, it, vi } from 'vitest';
import { HubApiError } from '@dude/api-client';
import type { HubClient } from '@dude/api-client';
import { HubManagerError } from './errors.js';
import { withNotificationsCredential } from './notifications-access.js';
import type { NotificationsHost } from './notifications-access.js';

const API = { tag: 'api' } as unknown as HubClient;

function host(options: { signedIn: boolean; owner?: () => Promise<unknown>; device?: () => Promise<unknown> }) {
  const withOwner = vi.fn(async (fn: (api: HubClient, token: string) => Promise<unknown>) => {
    if (options.owner) return options.owner();
    return fn(API, 'owner-token');
  });
  const deviceCall = vi.fn(async (fn: (api: HubClient, token: string) => Promise<unknown>, _options?: { authRetryOn403?: boolean }) => {
    if (options.device) return options.device();
    return fn(API, 'device-token');
  });
  const manager = { owner: { status: () => ({ signedIn: options.signedIn, displayName: null, expiresAt: null }), withOwner }, deviceCall } as unknown as NotificationsHost;
  return { manager, withOwner, deviceCall };
}

describe('withNotificationsCredential (PD-110)', () => {
  it('uses the owner bearer when the owner is signed in on this agent, and never touches the device token', async () => {
    const { manager, withOwner, deviceCall } = host({ signedIn: true });
    const use = vi.fn(async (_api: HubClient, token: string) => token);
    expect(await withNotificationsCredential(manager, use)).toBe('owner-token');
    expect(withOwner).toHaveBeenCalledOnce();
    expect(deviceCall).not.toHaveBeenCalled();
  });

  it('uses the device token when the owner is not signed in, without refreshing the token on a 403', async () => {
    const { manager, withOwner, deviceCall } = host({ signedIn: false });
    const use = vi.fn(async (_api: HubClient, token: string) => token);
    expect(await withNotificationsCredential(manager, use)).toBe('device-token');
    expect(withOwner).not.toHaveBeenCalled();
    expect(deviceCall.mock.calls[0]?.[1]).toEqual({ authRetryOn403: false });
  });

  it('falls through to the device token when the held owner session has expired', async () => {
    const { manager, withOwner, deviceCall } = host({ signedIn: true, owner: async () => { throw new HubManagerError('owner-session-expired', 'The owner session expired. Sign in again.'); } });
    expect(await withNotificationsCredential(manager, async (_api, token) => token)).toBe('device-token');
    expect(withOwner).toHaveBeenCalledOnce();
    expect(deviceCall).toHaveBeenCalledOnce();
  });

  it('keeps an owner-path Hub failure as it is instead of retrying as the device', async () => {
    const { manager, deviceCall } = host({ signedIn: true, owner: async () => { throw new HubApiError(500, 'internal', 'boom'); } });
    await expect(withNotificationsCredential(manager, async () => 1)).rejects.toMatchObject({ status: 500 });
    expect(deviceCall).not.toHaveBeenCalled();
  });

  it.each([403, 401])('turns a %s on the device path into notifications-unavailable', async (status) => {
    const { manager } = host({ signedIn: false, device: async () => { throw new HubApiError(status, 'forbidden', 'nope'); } });
    await expect(withNotificationsCredential(manager, async () => 1)).rejects.toMatchObject({ name: 'HubManagerError', code: 'notifications-unavailable' });
  });

  it('keeps other device-path failures (not enrolled, unreachable, a 5xx) as they are', async () => {
    const notEnrolled = host({ signedIn: false, device: async () => { throw new HubManagerError('not-enrolled', 'This device is not enrolled with a Hub.'); } });
    await expect(withNotificationsCredential(notEnrolled.manager, async () => 1)).rejects.toMatchObject({ code: 'not-enrolled' });
    const down = host({ signedIn: false, device: async () => { throw new HubApiError(503, 'unavailable', 'down'); } });
    await expect(withNotificationsCredential(down.manager, async () => 1)).rejects.toMatchObject({ status: 503 });
  });
});
