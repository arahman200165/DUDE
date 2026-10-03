import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { SYNC_PORT } from '../../core/sync/sync.port';
import { createFakeSyncPort, syncStatus } from '../../core/sync/testing/fake-sync-port';
import type { AgentSyncStatus } from '@dude/contracts';
import { SyncIndicator } from './sync-indicator';

const tick = () => new Promise<void>((resolve) => setTimeout(resolve));

async function mount(initial: AgentSyncStatus | null) {
  const fake = createFakeSyncPort({}, initial ?? syncStatus());
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: SYNC_PORT, useValue: initial === null ? null : fake.port }] });
  const fixture = TestBed.createComponent(SyncIndicator);
  fixture.detectChanges();
  await tick();
  fixture.detectChanges();
  return { fixture, el: fixture.nativeElement as HTMLElement, fake };
}
const link = (el: HTMLElement) => el.querySelector('[data-testid="sync-indicator"]');

describe('SyncIndicator', () => {
  it('renders nothing on web (no port)', async () => {
    const { el } = await mount(null);
    expect(link(el)).toBeNull();
  });

  it('renders nothing while standalone', async () => {
    const { el } = await mount(syncStatus({ phase: 'standalone' }));
    expect(link(el)).toBeNull();
  });

  it.each([
    ['synced', syncStatus(), 'Synced'],
    ['syncing', syncStatus({ phase: 'syncing' }), 'Syncing'],
    ['pending', syncStatus({ pending: 3 }), '3 pending'],
    ['offline', syncStatus({ phase: 'offline' }), 'Offline'],
    ['paused', syncStatus({ phase: 'paused' }), 'Paused'],
    ['conflicts', syncStatus({ conflicts: 2, pending: 5 }), '2 conflicts'],
    ['needs-first-sync', syncStatus({ phase: 'needs-first-sync' }), 'Set up sync'],
    ['revoked', syncStatus({ phase: 'revoked', pending: 1 }), 'Revoked'],
  ] as const)('shows the %s state with a text label and an accessible name', async (state, status, label) => {
    const { el } = await mount(status);
    const a = link(el);
    expect(a?.getAttribute('data-state')).toBe(state);
    expect(a?.textContent?.trim()).toBe(label);
    expect(a?.getAttribute('aria-label')).toContain(label);
    expect(a?.getAttribute('href')).toBe('/settings/sync');
  });

  it('pulses only under motion-safe while syncing', async () => {
    const { el } = await mount(syncStatus({ phase: 'syncing' }));
    const dot = el.querySelector('span[aria-hidden="true"]');
    expect(dot?.className).toContain('motion-safe:animate-pulse');
    expect(dot?.className).not.toMatch(/(^|\s)animate-pulse/);
  });

  it('updates live when the Agent pushes a new status', async () => {
    const { fixture, el, fake } = await mount(syncStatus());
    fake.emitStatus(syncStatus({ phase: 'offline' }));
    fixture.detectChanges();
    expect(link(el)?.getAttribute('data-state')).toBe('offline');
  });

  describe('on Hub-served web', () => {
    async function mountWeb(initial: AgentSyncStatus) {
      const fake = createFakeSyncPort({ host: 'web' } as never, initial);
      TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: SYNC_PORT, useValue: fake.port }] });
      const fixture = TestBed.createComponent(SyncIndicator);
      fixture.detectChanges();
      await tick();
      fixture.detectChanges();
      return { fixture, el: fixture.nativeElement as HTMLElement, fake };
    }

    it.each([
      ['live', syncStatus(), 'Live', 'synced'],
      ['Hub unreachable', syncStatus({ phase: 'offline' }), 'Hub unreachable', 'offline'],
      ['session expired', syncStatus({ phase: 'revoked' }), 'Session expired', 'revoked'],
      ['incompatible', syncStatus({ phase: 'hub-outdated' }), 'Reload needed', 'attention'],
    ] as const)('shows %s', async (_name, status, label, state) => {
      const { el } = await mountWeb(status);
      const a = link(el);
      expect(a?.textContent?.trim()).toBe(label);
      expect(a?.getAttribute('data-state')).toBe(state);
    });

    it('explains that changes are paused while the Hub is unreachable', async () => {
      const { el } = await mountWeb(syncStatus({ phase: 'offline' }));
      expect(link(el)?.getAttribute('title')).toContain('changes paused');
    });
  });
});
