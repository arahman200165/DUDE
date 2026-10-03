import { vi } from 'vitest';
import type { SessionInfo, SignInResponse } from '@dude/contracts/hub';
import { HubAdminPort } from '../../core/hub/hub-admin.port';

export const CODES = Array.from({ length: 10 }, (_, i) => `ABCDE-0000${i}`.slice(0, 11));
export const SETUP_TOKEN_VALUE = 'a'.repeat(43);

export function session(overrides: Partial<SessionInfo> = {}): SessionInfo {
  return {
    sessionId: '0123456789abcdef', kind: 'cookie', createdAt: '2026-10-01T10:00:00Z', lastActiveAt: '2026-10-01T11:00:00Z',
    idleExpiresAt: '2026-10-02T10:00:00Z', absoluteExpiresAt: '2026-10-08T10:00:00Z', current: false, userAgent: null, ip: '10.0.0.1', deviceId: null,
    ...overrides,
  };
}

export function signInResponse(remaining = 10): SignInResponse {
  return { csrfToken: 'csrf', session: session({ current: true }), owner: { ownerId: 'o1', displayName: 'Owner', remainingRecoveryCodes: remaining } };
}

type Mocked = { [K in keyof HubAdminPort]: ReturnType<typeof vi.fn> };

/** A HubAdminPort whose every method is a vi.fn with a benign default; override per test with `mockRejectedValueOnce` etc. */
export function fakeHubAdmin(): HubAdminPort & Mocked {
  const preview = { confirmToken: 'tok', expiresAt: '2099-01-01T00:00:00Z', summary: { action: 'x', affectedSessions: 2, remainingRecoveryCodes: 3 } };
  const fake = {
    status: vi.fn(), probeLocal: vi.fn(async () => ({ found: true, port: 1, hubInstanceId: 'h', hubVersion: '1', bootstrapped: true })),
    enroll: vi.fn(), unenroll: vi.fn(), ownerStatus: vi.fn(), ownerSignIn: vi.fn(), ownerSignOut: vi.fn(async () => ({ ok: true })),
    listDevices: vi.fn(), syncSummary: vi.fn(), createPairingCode: vi.fn(), renameDevice: vi.fn(), revokeDevicePreview: vi.fn(), revokeDevice: vi.fn(), setRecoveryTrust: vi.fn(),
    listSessions: vi.fn(async () => [session({ current: true, sessionId: 'aaaaaaaaaaaaaaaa' }), session({ sessionId: 'bbbbbbbbbbbbbbbb' })]),
    revokeSession: vi.fn(async () => ({ ok: true })),
    revokeAllPreview: vi.fn(async () => preview), revokeAll: vi.fn(async () => ({ ok: true })),
    listAudit: vi.fn(async () => ({ events: [], nextBeforeSeq: null })),
    recoveryCodesPreview: vi.fn(async () => preview), regenerateRecoveryCodes: vi.fn(async () => ({ recoveryCodes: CODES })),
    changePassword: vi.fn(async () => ({ ok: true })),
    bootstrap: vi.fn(async () => ({ environmentId: 'e', ownerId: 'o', recoveryCodes: CODES })),
    signIn: vi.fn(async () => signInResponse()), currentSession: vi.fn(async () => signInResponse(7)), signOut: vi.fn(async () => ({ ok: true })),
    recover: vi.fn(async () => signInResponse(5)), ownerReset: vi.fn(async () => ({ recoveryCodes: CODES })),
  };
  return fake as unknown as HubAdminPort & Mocked;
}

export async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }): Promise<void> {
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

export function typeInto(root: HTMLElement, selector: string, value: string): void {
  const input = root.querySelector(selector) as HTMLInputElement;
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

export function buttonWithText(root: HTMLElement, text: string): HTMLButtonElement {
  return Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement;
}
