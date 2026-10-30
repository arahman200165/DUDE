import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BackupStatusResponse, HubProvisioningComponent, HubProvisioningComponentId, HubProvisioningResponse, HubTunnelStatusResponse } from '@dude/contracts/hub';
import { HubAdminError } from '../../../../core/hub/hub-admin.port';
import { HUB_ADMIN } from '../../../../core/hub/hub-admin.token';
import { HUB_EVENTS, HubEventsFeed } from '../../../../core/hub-events/hub-events.port';
import { COPY_FAILED_TEXT, HubPlatformPanel } from './hub-platform-panel';
import { HubOwnerSession } from './hub-owner-session.service';

const NOW = new Date().toISOString();
const IDS: readonly HubProvisioningComponentId[] = ['content-store', 'fts', 'vector', 'blob-store', 'cache', 'queue', 'workers', 'secrets', 'tunnel', 'oidc', 'power'];
const component = (id: HubProvisioningComponentId, state: HubProvisioningComponent['state'], detail = `${id} works.`): HubProvisioningComponent => ({ id, state, detail, checkedAt: NOW });

function provisioning(byId: Partial<Record<HubProvisioningComponentId, HubProvisioningComponent>> = {}, overall: HubProvisioningResponse['overall'] = 'ready'): HubProvisioningResponse {
  return { overall, checkedAt: NOW, lastRun: { at: NOW, outcome: 'ok' }, secrets: [], commands: ['dude-hub provision'], components: IDS.map((id) => byId[id] ?? component(id, 'ready')) };
}
const TUNNEL: HubTunnelStatusResponse = {
  configured: false, enabled: false, hostname: null, supported: true, state: 'not-configured', ready: false, tokenPresent: false, restarts: 0, lastError: null, startedAt: null, lastReadyAt: null,
  dashboard: null, disclosure: [], logTail: [],
};
const BACKUP: BackupStatusResponse = {
  authority: { epoch: 1, state: 'active' }, lastBackup: { at: NOW, ok: true }, schedule: { configured: true, intervalHours: 24, keyPresent: true }, defaultFolder: 'backups', devicesNeedingRePair: 0,
  destinations: [{
    id: 'local-1', kind: 'local-folder', label: 'Nightly disk', lastSuccessAt: NOW, lastBackupId: 'b1', lastError: null, lastErrorAt: null, lastVerifiedAt: NOW, repoBytes: 1024 * 1024, nextDueAt: null,
    lastDrillOutcome: 'success', lastDrillAt: NOW,
  }],
};

interface Overrides {
  readonly provisioningStatus?: () => Promise<HubProvisioningResponse>;
  readonly tunnelStatus?: () => Promise<HubTunnelStatusResponse>;
  readonly backupStatus?: () => Promise<BackupStatusResponse>;
  readonly withReads?: boolean;
  readonly signedIn?: boolean;
  readonly noteError?: (error: unknown) => boolean;
}

const settle = async (fixture: { whenStable(): Promise<unknown>; detectChanges(): void }): Promise<void> => {
  for (let i = 0; i < 3; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  }
};

function mount(o: Overrides = {}) {
  const hub = {
    ...(o.withReads === false ? {} : { provisioningStatus: vi.fn(o.provisioningStatus ?? (async () => provisioning())), tunnelStatus: vi.fn(o.tunnelStatus ?? (async () => TUNNEL)) }),
    backupStatus: vi.fn(o.backupStatus ?? (async () => BACKUP)),
  };
  const signedIn = signal(o.signedIn ?? true);
  const noteError = vi.fn(o.noteError ?? (() => false));
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      { provide: HUB_ADMIN, useValue: hub },
      { provide: HubOwnerSession, useValue: { signedIn, noteError } },
      { provide: HUB_EVENTS, useExisting: HubEventsFeed },
    ],
  });
  const fixture = TestBed.createComponent(HubPlatformPanel);
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, hub, signedIn, noteError, feed: TestBed.inject(HubEventsFeed) };
}

const q = (el: HTMLElement, id: string): HTMLElement | null => el.querySelector(`[data-testid="${id}"]`);
const text = (el: HTMLElement, id: string): string => q(el, id)?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
const row = (el: HTMLElement, id: string): HTMLElement => q(el, `platform-row-${id}`)!;

afterEach(() => vi.restoreAllMocks());

describe('HubPlatformPanel (Milestone 852)', () => {
  it('renders nothing and requests nothing where the host has no platform reads (desktop, Pages)', async () => {
    const { fixture, el, hub } = mount({ withReads: false });
    await settle(fixture);
    expect(q(el, 'hub-platform')).toBeNull();
    expect(hub.backupStatus).not.toHaveBeenCalled();
  });

  it('reads nothing until the owner is signed in', async () => {
    const { fixture, el, hub } = mount({ signedIn: false });
    await settle(fixture);
    expect(hub.provisioningStatus).not.toHaveBeenCalled();
    expect(hub.tunnelStatus).not.toHaveBeenCalled();
    expect(hub.backupStatus).not.toHaveBeenCalled();
    expect(q(el, 'platform-group-storage')).toBeNull();
  });

  it('lists the components under headings with a chip each, and says nothing needs attention when all is well', async () => {
    const { fixture, el } = mount();
    await settle(fixture);
    expect(el.querySelector('h3')?.textContent).toBe('Platform');
    expect(Array.from(el.querySelectorAll('h4')).map((h) => h.textContent?.trim())).toEqual(['Setup', 'Storage', 'Queue and workers', 'Sign-in and access', 'This computer', 'Backups and standby']);
    // Every row has its chip as text (never color alone) and a glyph beside it.
    for (const li of Array.from(el.querySelectorAll('[data-testid^="platform-row-"]'))) {
      expect(li.querySelector('[data-testid="row-chip"]')?.textContent?.trim().length).toBeGreaterThan(1);
      expect(li.querySelector('[data-testid="row-chip"] app-status-glyph')).not.toBeNull();
    }
    expect(text(el, 'platform-summary')).toMatch(/^Nothing needs your attention\./);
    expect(el.querySelector('[data-testid="platform-live"]')?.getAttribute('aria-live')).toBe('polite');
  });

  it('shows each state with its reason and the exact command to copy', async () => {
    const { fixture, el } = mount({
      provisioningStatus: async () => provisioning({
        'blob-store': component('blob-store', 'not-configured', 'The blob directories have not been created yet.'),
        power: component('power', 'needs-attention', 'This computer can sleep again.'),
        vector: component('vector', 'unavailable', 'Vector search is unavailable on this build.'),
        tunnel: component('tunnel', 'not-configured', 'No managed tunnel is configured.'),
      }, 'needs-provisioning'),
    });
    await settle(fixture);
    expect(row(el, 'blob-store').getAttribute('data-chip')).toBe('off');
    expect(text(row(el, 'blob-store') as HTMLElement, 'row-reason')).toBe('The blob directories have not been created yet.');
    expect(Array.from(row(el, 'blob-store').querySelectorAll('[data-testid="command-text"]')).map((c) => c.textContent)).toEqual(['dude-hub provision']);
    expect(row(el, 'vector').getAttribute('data-chip')).toBe('unavailable');
    expect(row(el, 'vector').querySelector('[data-testid="command-text"]')).toBeNull();
    expect(Array.from(row(el, 'power').querySelectorAll('[data-testid="command-text"]')).map((c) => c.textContent)).toEqual(['dude-hub power status', 'dude-hub power apply']);
    expect(Array.from(row(el, 'tunnel').querySelectorAll('[data-testid="command-text"]')).map((c) => c.textContent)).toEqual(['dude-hub network tunnel on --hostname <your-domain> --token-stdin']);
    expect(Array.from(row(el, 'setup').querySelectorAll('[data-testid="command-text"]')).map((c) => c.textContent)).toEqual(['dude-hub provision']);
    expect(text(el, 'platform-summary')).toMatch(/^[0-9]+ items need your attention\./);
  });

  it('shows the backup destinations with their last restore drill and the standby row without inventing a status', async () => {
    const { fixture, el } = mount();
    await settle(fixture);
    expect(text(el, 'destination-local-1')).toContain('Nightly disk');
    expect(text(el, 'destination-local-1')).toContain('Last restore drill passed');
    expect(row(el, 'backup').getAttribute('data-chip')).toBe('ok');
    expect(row(el, 'standby').getAttribute('data-chip')).toBe('unknown');
    expect(text(row(el, 'standby') as HTMLElement, 'row-chip')).toBe('Not shown here');
    expect(Array.from(row(el, 'standby').querySelectorAll('[data-testid="command-text"]')).map((c) => c.textContent)).toEqual(['dude-hub standby list', 'dude-hub standby grant <deviceId>']);
  });

  it('still shows what it can read when one read fails, and marks the rest not readable', async () => {
    const { fixture, el } = mount({ tunnelStatus: async () => { throw new HubAdminError('network', 'down'); }, backupStatus: async () => { throw new HubAdminError('hub-transferred', 'x'); } });
    await settle(fixture);
    expect(row(el, 'content-store').getAttribute('data-chip')).toBe('ok');
    expect(row(el, 'backup').getAttribute('data-chip')).toBe('unknown');
    expect(q(el, 'platform-error')).toBeNull();
  });

  it('says so, in an alert, when nothing could be read', async () => {
    const down = async (): Promise<never> => { throw new HubAdminError('network', 'The Hub could not be reached.'); };
    const { fixture, el } = mount({ provisioningStatus: down, tunnelStatus: down, backupStatus: down });
    await settle(fixture);
    expect(text(el, 'platform-error')).toContain('The Hub could not be reached.');
    expect(q(el, 'platform-error')?.getAttribute('role')).toBe('alert');
    expect(q(el, 'platform-group-storage')).toBeNull();
  });

  it('hands an expired owner session to the gate instead of showing an error', async () => {
    const gone = async (): Promise<never> => { throw new HubAdminError('owner-session-expired', 'expired'); };
    const { fixture, el, noteError } = mount({ provisioningStatus: gone, noteError: () => true });
    await settle(fixture);
    expect(noteError).toHaveBeenCalled();
    expect(q(el, 'platform-error')).toBeNull();
    expect(q(el, 'platform-group-storage')).toBeNull();
  });

  it('refreshes on the button and quietly when the Hub reports backup health changed', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const { fixture, el, hub, feed } = mount();
      await settle(fixture);
      expect(hub.backupStatus).toHaveBeenCalledTimes(1);
      (q(el, 'platform-refresh') as HTMLButtonElement).click();
      await settle(fixture);
      expect(hub.backupStatus).toHaveBeenCalledTimes(2);
      feed.notify('backup');
      await vi.advanceTimersByTimeAsync(400);
      await settle(fixture);
      expect(hub.backupStatus).toHaveBeenCalledTimes(3);
      expect(q(el, 'platform-loading')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  describe('copy buttons', () => {
    it('copy the command exactly as shown and confirm it in the live region', async () => {
      const writeText = vi.fn(async () => undefined);
      vi.stubGlobal('navigator', { clipboard: { writeText } });
      try {
        const { fixture, el } = mount({ provisioningStatus: async () => provisioning({ power: component('power', 'needs-attention', 'Sleeps.') }) });
        await settle(fixture);
        const buttons = Array.from(row(el, 'power').querySelectorAll<HTMLButtonElement>('[data-testid="command-copy"]'));
        expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Copy command: Check the power settings', 'Copy command: Stop this computer sleeping on AC power']);
        buttons[1].click();
        await settle(fixture);
        expect(writeText).toHaveBeenCalledExactlyOnceWith('dude-hub power apply');
        expect(buttons[1].textContent?.trim()).toBe('Copied!');
        expect(text(el, 'copy-notice')).toBe('Copied: Stop this computer sleeping on AC power.');
        expect(q(el, 'copy-notice')?.closest('[aria-live]')?.getAttribute('aria-live')).toBe('polite');
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('says so when the clipboard refuses, leaving the command selectable', async () => {
      vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn(async () => { throw new DOMException('denied', 'NotAllowedError'); }) } });
      try {
        const { fixture, el } = mount({ provisioningStatus: async () => provisioning({ power: component('power', 'needs-attention', 'Sleeps.') }) });
        await settle(fixture);
        row(el, 'power').querySelector<HTMLButtonElement>('[data-testid="command-copy"]')!.click();
        await settle(fixture);
        expect(text(el, 'copy-notice')).toBe(COPY_FAILED_TEXT);
        expect(row(el, 'power').querySelector('[data-testid="command-copy"]')?.textContent?.trim()).toBe('Copy');
        expect(row(el, 'power').querySelector('[data-testid="command-text"]')?.className).toContain('select-all');
      } finally {
        vi.unstubAllGlobals();
      }
    });

    it('also handles a missing clipboard API', async () => {
      vi.stubGlobal('navigator', {});
      try {
        const { fixture, el } = mount({ provisioningStatus: async () => provisioning({ power: component('power', 'needs-attention', 'Sleeps.') }) });
        await settle(fixture);
        row(el, 'power').querySelector<HTMLButtonElement>('[data-testid="command-copy"]')!.click();
        await settle(fixture);
        expect(text(el, 'copy-notice')).toBe(COPY_FAILED_TEXT);
      } finally {
        vi.unstubAllGlobals();
      }
    });
  });

  describe('view-only (decision 5)', () => {
    it('has no control but Refresh and the copy buttons, and no form field, so nothing can change the Hub', async () => {
      const { fixture, el } = mount({
        provisioningStatus: async () => provisioning({ tunnel: component('tunnel', 'not-configured'), power: component('power', 'needs-attention') }, 'needs-provisioning'),
        backupStatus: async () => ({ ...BACKUP, destinations: [] }),
      });
      await settle(fixture);
      const buttons = Array.from(el.querySelectorAll('button'));
      expect(buttons.length).toBeGreaterThan(3);
      for (const b of buttons) {
        const id = b.getAttribute('data-testid');
        // `app-disclosure` toggles are the only other buttons, and they only show text.
        if (id === 'platform-refresh' || id === 'command-copy') continue;
        expect(b.closest('app-disclosure'), b.outerHTML).not.toBeNull();
      }
      expect(el.querySelectorAll('input, select, textarea, form, a[href]').length).toBe(0);
    });

    it('only ever calls the read methods of the port', async () => {
      const { fixture, hub } = mount();
      await settle(fixture);
      expect(Object.keys(hub).sort()).toEqual(['backupStatus', 'provisioningStatus', 'tunnelStatus']);
    });
  });
});
