import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { AgentSyncStatus } from '@dude/contracts';
import { FIRST_SYNC_STALE, SYNC_PORT, SyncError, type SyncPort } from '../../../core/sync/sync.port';
import { conflict, createFakeSyncPort, firstSyncPreview, quarantinedOp, syncStatus } from '../../../core/sync/testing/fake-sync-port';
import { SyncSettings } from './sync-settings';

async function settle(fixture: { whenStable(): Promise<unknown>; detectChanges(): void }): Promise<void> {
  for (let i = 0; i < 3; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
  }
}

async function mount(status: AgentSyncStatus, overrides: Partial<SyncPort> = {}) {
  const fake = createFakeSyncPort(overrides, status);
  TestBed.configureTestingModule({ providers: [provideRouter([]), { provide: SYNC_PORT, useValue: fake.port }] });
  const fixture = TestBed.createComponent(SyncSettings);
  fixture.detectChanges();
  await settle(fixture);
  const el = fixture.nativeElement as HTMLElement;
  return { fixture, el, fake };
}
const q = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);
const click = (el: HTMLElement, id: string) => {
  const target = q(el, id);
  expect(target, id).not.toBeNull();
  target!.click();
};

describe('SyncSettings', () => {
  it('shows actionable copy per phase', async () => {
    const standalone = await mount(syncStatus({ phase: 'standalone' }));
    expect(q(standalone.el, 'phase-copy')?.textContent).toContain('not connected to a Hub');
    expect(standalone.el.querySelector('a[href="/settings/environment"]')).not.toBeNull();
    expect(q(standalone.el, 'categories')).toBeNull();
  });

  it('describes an error phase with the last error', async () => {
    const { el } = await mount(syncStatus({ phase: 'error', lastError: 'tls handshake failed' }));
    expect(q(el, 'phase-copy')?.textContent).toContain('tls handshake failed');
  });

  it('Sync now and Pause call the port', async () => {
    const { fixture, el, fake } = await mount(syncStatus());
    click(el, 'sync-now');
    click(el, 'pause');
    await settle(fixture);
    expect(fake.port.syncNow).toHaveBeenCalled();
    expect(fake.port.setPaused).toHaveBeenCalledWith(true);
  });

  it('toggles a category and shows the default-off rationale for scratchpad', async () => {
    const { fixture, el, fake } = await mount(syncStatus());
    expect(q(el, 'why-scratchpad')?.textContent).toContain('sensitive content');
    const box = q(el, 'toggle-scratchpad') as HTMLInputElement;
    expect(box.checked).toBe(false);
    box.checked = true;
    box.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(fake.port.setCategories).toHaveBeenCalledWith({ scratchpad: true });
  });

  describe('first-sync wizard', () => {
    const needs = () => syncStatus({ phase: 'needs-first-sync' });

    it('previews, defaults to the recommendation and applies without a token when nothing is replaced', async () => {
      const { fixture, el, fake } = await mount(needs());
      expect(fake.port.firstSyncPreview).not.toHaveBeenCalled();
      click(el, 'start-first-sync');
      await settle(fixture);
      expect(fake.port.firstSyncApply).not.toHaveBeenCalled();
      expect((q(el, 'choice-favorites-merge') as HTMLInputElement).checked).toBe(true);
      expect(el.textContent).toContain('Pipelines and scripts');
      expect(el.textContent).toContain('Collisions');

      const keep = q(el, 'choice-favorites-keep-local') as HTMLInputElement;
      keep.click();
      keep.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      click(el, 'first-sync-continue');
      await settle(fixture);
      expect(fake.port.firstSyncApply).toHaveBeenCalledWith({ favorites: 'keep-local', pipelines: 'merge' }, 'digest-1', undefined);
    });

    it('Use Hub needs an explicit second confirmation, then passes the confirm token', async () => {
      const { fixture, el, fake } = await mount(needs());
      click(el, 'start-first-sync');
      await settle(fixture);
      const useHub = q(el, 'choice-pipelines-use-hub') as HTMLInputElement;
      useHub.dispatchEvent(new Event('change'));
      fixture.detectChanges();
      click(el, 'first-sync-continue');
      fixture.detectChanges();
      expect(fake.port.firstSyncApply).not.toHaveBeenCalled();
      expect(q(el, 'use-hub-confirm')?.textContent).toContain('recovery snapshot');
      expect(q(el, 'use-hub-confirm')?.textContent).toContain('Pipelines and scripts');
      click(el, 'use-hub-apply');
      await settle(fixture);
      expect(fake.port.firstSyncApply).toHaveBeenCalledWith({ favorites: 'merge', pipelines: 'use-hub' }, 'digest-1', 'tok-1');
    });

    it('re-previews when the Hub changed (first-sync-stale)', async () => {
      let calls = 0;
      const { fixture, el, fake } = await mount(needs(), {
        firstSyncPreview: async () => firstSyncPreview({ digest: `d${++calls}` }),
        firstSyncApply: async () => { throw new SyncError(FIRST_SYNC_STALE, 'stale'); },
      });
      click(el, 'start-first-sync');
      await settle(fixture);
      click(el, 'first-sync-continue');
      await settle(fixture);
      expect(fake.port.firstSyncPreview).toHaveBeenCalledTimes(2);
      expect(q(el, 'first-sync-error')?.textContent).toContain('Hub changed');
    });
  });

  describe('conflict inbox', () => {
    const withConflict = (c = conflict()) => mount(syncStatus({ conflicts: 1 }), { listConflicts: async () => [c] });

    it('lists the conflict, diffs local against the Hub and resolves', async () => {
      const { fixture, el, fake } = await withConflict();
      expect(q(el, 'conflict-1')?.textContent).toContain('Build');
      click(el, 'conflict-1');
      fixture.detectChanges();
      const detail = q(el, 'conflict-detail');
      expect(detail?.textContent).toContain('"steps": 2');
      expect(detail?.textContent).toContain('"steps": 3');
      click(el, 'keep-hub');
      await settle(fixture);
      expect(fake.port.resolveConflict).toHaveBeenCalledWith(1, 'hub');
    });

    it('offers Keep mine, and Keep both only when allowed', async () => {
      const { fixture, el, fake } = await withConflict(conflict({ canKeepBoth: false }));
      click(el, 'conflict-1');
      fixture.detectChanges();
      expect(q(el, 'keep-both')).toBeNull();
      click(el, 'keep-mine');
      await settle(fixture);
      expect(fake.port.resolveConflict).toHaveBeenCalledWith(1, 'mine');
    });

    it('Keep both forks a copy when the conflict allows it', async () => {
      const { fixture, el, fake } = await withConflict();
      click(el, 'conflict-1');
      fixture.detectChanges();
      click(el, 'keep-both');
      await settle(fixture);
      expect(fake.port.resolveConflict).toHaveBeenCalledWith(1, 'both');
    });

    it('shows a failed resolution', async () => {
      const { fixture, el } = await mount(syncStatus({ conflicts: 1 }), { listConflicts: async () => [conflict()], resolveConflict: async () => ({ ok: false, error: 'stale conflict' }) });
      click(el, 'conflict-1');
      fixture.detectChanges();
      click(el, 'keep-hub');
      await settle(fixture);
      expect(q(el, 'conflict-error')?.textContent).toContain('stale conflict');
    });
  });

  describe('rejected changes', () => {
    const withOp = () => mount(syncStatus({ quarantined: 1 }), { listQuarantined: async () => [quarantinedOp()] });

    it('discard is two-step: preview, then confirm with the token', async () => {
      const { fixture, el, fake } = await withOp();
      expect(q(el, 'op-op-1')?.textContent).toContain('too large');
      click(el, 'discard');
      await settle(fixture);
      expect(fake.port.discardQuarantinedPreview).toHaveBeenCalledWith('op-1');
      expect(fake.port.discardQuarantined).not.toHaveBeenCalled();
      expect(q(el, 'discard-confirm')).not.toBeNull();
      click(el, 'discard-apply');
      await settle(fixture);
      expect(fake.port.discardQuarantined).toHaveBeenCalledWith('op-1', 'discard-tok');
    });

    it('cancel leaves the op alone, and Retry / Retry all call the port', async () => {
      const { fixture, el, fake } = await withOp();
      click(el, 'discard');
      await settle(fixture);
      (q(el, 'discard-confirm')!.querySelectorAll('button')[1] as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(q(el, 'discard-confirm')).toBeNull();
      expect(fake.port.discardQuarantined).not.toHaveBeenCalled();
      click(el, 'retry');
      await settle(fixture);
      expect(fake.port.retryQuarantined).toHaveBeenCalledWith(['op-1']);
      click(el, 'retry-all');
      await settle(fixture);
      expect(fake.port.retryQuarantined).toHaveBeenCalledWith(undefined);
    });
  });

  describe('revoked device', () => {
    it('Continue standalone previews first and applies only after the explicit confirm', async () => {
      const { fixture, el, fake } = await mount(syncStatus({ phase: 'revoked', stranded: 2 }));
      expect(q(el, 'stranded-note')?.textContent).toContain('never reached the Hub');
      click(el, 'standalone-preview');
      await settle(fixture);
      expect(fake.port.standalonePreview).toHaveBeenCalled();
      expect(fake.port.standaloneApply).not.toHaveBeenCalled();
      expect(q(el, 'standalone-confirm')?.textContent).toContain('2 changes');
      click(el, 'standalone-apply');
      await settle(fixture);
      expect(fake.port.standaloneApply).toHaveBeenCalledWith('sa-tok', 'sa-digest');
    });
  });

  it('shows held changes with an explanation', async () => {
    const { el } = await mount(syncStatus({ held: 3 }));
    expect(q(el, 'held-note')?.textContent).toContain('held on this device');
  });
});
