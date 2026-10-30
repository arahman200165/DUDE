import { expect, vi, type Mock } from 'vitest';
import { TestBed } from '@angular/core/testing';
import type { DesktopProvisionRequest } from '@dude/contracts/shared/models/platform-bridge.model';
import { createDesktopHubAdmin } from '../../../../../core/hub/desktop-hub-admin.adapter';
import { HubAdminError, type HubAdminPort } from '../../../../../core/hub/hub-admin.port';
import { PLATFORM_BRIDGE } from '../../../../../core/platform/platform-bridge.adapter';
import { fakeHub, FAKE_HUB_DEVICE_ID, type FakeLocalHubScenario } from '../../../../../core/platform/testing/fake-hub';
import { HubProvisioningWizard } from '../hub-provisioning-wizard';
import { buttonWithText, configureHubTest, createTestPort, settle, typeInto } from './hub-test-port';

/** Shared setup for the provisioning wizard specs: the wizard over the fake Hub, a scriptable step handler and small DOM helpers. */
export const PHRASE = 'EXPOSE HUB THROUGH CLOUDFLARE';

type StepFailures = Partial<Record<DesktopProvisionRequest['step'], HubAdminError>>;

export interface MountOptions {
  readonly localHub?: FakeLocalHubScenario;
  /** Steps that fail with this error instead of reaching the fake Hub. */
  readonly failures?: StepFailures;
  readonly overrides?: Partial<HubAdminPort>;
  /** Gives the desktop a standby bridge (status and folder dialog) so the standby step is offered. */
  readonly standby?: boolean;
}

const standbyStatus = (folder: string | null) => ({
  phase: 'idle', folder, deviceId: FAKE_HUB_DEVICE_ID, lastAttemptAt: null, lastSuccessAt: null, nextRunAt: null, grantedAt: null, lastError: null, lastRunBytes: 0, mirrorBytes: 0,
  repositories: [], progress: null,
});

export async function mountWizard(options: MountOptions = {}) {
  const scripted = fakeHub();
  const admin = createDesktopHubAdmin(() => scripted);
  const failures = options.failures ?? {};
  const overrides: Partial<HubAdminPort> = {
    provisionStep: ((request: DesktopProvisionRequest) => {
      const failure = failures[request.step];
      return failure ? Promise.reject(failure) : (admin.provisionStep as (r: DesktopProvisionRequest) => Promise<unknown>)(request);
    }) as HubAdminPort['provisionStep'],
    ...options.overrides,
  };
  const { port, emitProvision } = createTestPort(overrides, { localHub: options.localHub ?? 'bootstrapped' });
  configureHubTest(port);
  const standby = { status: vi.fn(), pullNow: vi.fn(), chooseFolder: vi.fn() };
  standby.status.mockResolvedValue({ ok: true, result: standbyStatus(null) });
  standby.chooseFolder.mockResolvedValue({ ok: true, result: { canceled: false, status: standbyStatus('D:/standby') } });
  TestBed.overrideProvider(PLATFORM_BRIDGE, { useValue: { get: () => (options.standby ? { standby } : undefined) } });
  const fixture = TestBed.createComponent(HubProvisioningWizard);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, port, emitProvision, standby, scripted };
}

export type Mounted = Awaited<ReturnType<typeof mountWizard>>;

export const byId = (el: HTMLElement, id: string): HTMLElement | null => el.querySelector(`[data-testid="${id}"]`);
export const textOf = (el: HTMLElement, id: string): string => byId(el, id)?.textContent?.trim() ?? '';
export const field = (el: HTMLElement, id: string): HTMLInputElement => el.querySelector(`#${id}`) as HTMLInputElement;

export async function click(m: Mounted, target: string | HTMLElement | null): Promise<void> {
  const button = typeof target === 'string' ? (byId(m.el, target) ?? buttonWithText(m.el, target)) : target;
  (button as HTMLButtonElement).click();
  await settle(m.fixture);
}

export async function type(m: Mounted, id: string, value: string): Promise<void> {
  typeInto(field(m.el, id), value);
  await settle(m.fixture);
}

export const legend = (m: Mounted): string => textOf(m.el, 'step-indicator');

export async function start(m: Mounted): Promise<void> {
  await click(m, 'provision-start');
}

/** Skips forward until the legend names the step. */
export async function goTo(m: Mounted, title: string): Promise<void> {
  for (let i = 0; i < 8 && !legend(m).includes(title); i++) await click(m, 'step-next');
  expect(legend(m)).toContain(title);
}

export const stepCalls = (m: Mounted): DesktopProvisionRequest[] => (m.port.provisionStep as unknown as Mock).mock.calls.map((c) => c[0] as DesktopProvisionRequest);
export const stepNames = (m: Mounted): string[] => stepCalls(m).map((r) => r.step);

/** Walks the tunnel step to the preview. */
export async function previewTunnel(m: Mounted, hostname = 'hub.example.com'): Promise<void> {
  await goTo(m, 'Cloudflare Tunnel');
  await type(m, 'tunnel-hostname', hostname);
  await click(m, 'tunnel-preview-button');
}
