import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { DesktopHubStatus } from '@dude/contracts/shared/models/platform-bridge.model';
import type { DeviceInfo } from '@dude/contracts/hub';
import { createDesktopHubAdmin } from '../../../../../core/hub/desktop-hub-admin.adapter';
import { HubAdminPort } from '../../../../../core/hub/hub-admin.port';
import { HUB_ADMIN } from '../../../../../core/hub/hub-admin.token';
import { PlatformService } from '../../../../../core/platform/platform.service';
import { fakeHub, type FakeLocalHubScenario } from '../../../../../core/platform/testing/fake-hub';

type Spied = { [K in keyof HubAdminPort]: ReturnType<typeof vi.fn> & HubAdminPort[K] };

export const ENROLLED_STATUS: DesktopHubStatus = {
  enrollmentState: 'enrolled', hubUrl: 'https://hub.local:47600', environmentId: '0190aaaa-1111-7000-8000-000000000002', hubInstanceId: 'hub-1', hubVersion: null,
  reachable: true, connection: 'online', lastError: null, lastContactAt: new Date(Date.now() - 5 * 60_000).toISOString(),
};
export const STANDALONE_STATUS: DesktopHubStatus = { enrollmentState: 'standalone', hubUrl: null, environmentId: null, hubInstanceId: null, hubVersion: null, reachable: null };

export function device(id: string, displayName: string, extra: Partial<DeviceInfo> = {}): DeviceInfo {
  return {
    deviceId: id, displayName, platform: 'windows', appVersion: '1.2.3', protocolVersion: 1, capabilities: [], registeredAt: '2026-01-01T00:00:00.000Z',
    lastSeenAt: null, revokedAt: null, unenrolledAt: null, recoveryTrusted: false, online: false, current: false, ...extra,
  };
}

/**
 * A Hub admin port for component specs: the in-memory fake Hub behind the real desktop adapter, every method wrapped in
 * a `vi.fn` so specs can assert calls, with per-test overrides and a way to push live status events.
 */
export function createTestPort(overrides: Partial<HubAdminPort> = {}, options: { localHub?: FakeLocalHubScenario } = {}): { readonly port: Spied; emit(status: DesktopHubStatus): void; readonly bridge: ReturnType<typeof fakeHub> } {
  const bridge = fakeHub(options.localHub ? { localHub: options.localHub } : {});
  const listeners = new Set<(status: DesktopHubStatus) => void>();
  const base = createDesktopHubAdmin(() => ({
    ...bridge,
    onStatusChanged: (cb: (status: DesktopHubStatus) => void) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
  }));
  const merged: Record<string, unknown> = { ...base, ...overrides };
  const port = Object.fromEntries(Object.entries(merged).map(([key, fn]) => [key, vi.fn(fn as (...args: unknown[]) => unknown)])) as unknown as Spied;
  return { port, emit: (status) => listeners.forEach((listener) => listener(status)), bridge };
}

export function configureHubTest(port: HubAdminPort, hostKind: 'desktop' | 'hub-web' = 'desktop'): void {
  TestBed.configureTestingModule({
    providers: [provideRouter([]), { provide: HUB_ADMIN, useValue: port }, { provide: PlatformService, useValue: { hostKind } }],
  });
}

export async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }): Promise<void> {
  for (let i = 0; i < 2; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

export function buttonWithText(root: HTMLElement, text: string): HTMLButtonElement {
  return Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement;
}

export function typeInto(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input'));
}
