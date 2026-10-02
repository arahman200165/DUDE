import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EntityCommit } from '@dude/contracts';
import type { PanelDefinition } from '@dude/domain/shared/models/panel-definition.model';
import { HomeLayoutService } from '../../home-layout/home-layout.service';
import { PANEL_DEFINITIONS_TOKEN } from '../../registry/panel-registry.service';
import { UsageService, USAGE_COMMIT_DEBOUNCE_MS } from '../../usage/usage.service';
import { fakeElectronBridge, fakeStore } from '../../platform/testing/fake-electron-bridge';
import { provideBootSnapshot } from '../device-store/boot-snapshot';
import { createDegradedMemoryBackend } from '../device-store/device-kv-backend';
import { installLocalBackend, resetLocalBackend } from '../local-backend-registry';

const load = () => Promise.resolve(null);
const defs: PanelDefinition[] = [
  { id: 'rail', title: 'Rail', description: 'r', load, size: { minW: 3, minH: 2 }, dataDependencies: ['usage'], defaultPlacement: { order: 1, w: 6, h: 2 } },
];

const newerDoc = {
  schemaVersion: 2,
  futureField: { keep: true },
  customized: true,
  narrowCustomized: false,
  instances: [{ id: 'rail', kindId: 'rail', config: {}, visible: true }],
  wide: [{ id: 'rail', x: 0, y: 0, w: 12, h: 2 }],
  narrow: [],
  content: {},
};

/** Single-document entities (home layout, usage) over a recording fake Device Store, as on desktop. */
describe('document entities on the desktop store', () => {
  let commits: EntityCommit[];
  let flushCallbacks: Array<() => void | Promise<void>>;

  const setup = (records: Array<{ entityType: string; entityId: string; payload: unknown }> = []): void => {
    commits = [];
    flushCallbacks = [];
    const base = fakeStore();
    const store = {
      ...base,
      commitEntity: async (commit: EntityCommit) => {
        commits.push(commit);
        return base.commitEntity(commit);
      },
      onFlushRequest: (callback: () => void | Promise<void>) => {
        flushCallbacks.push(callback);
        return () => undefined;
      },
    };
    Object.defineProperty(window, 'dude', { value: fakeElectronBridge({ store }), configurable: true, writable: true });
    installLocalBackend(createDegradedMemoryBackend());
    TestBed.configureTestingModule({
      providers: [
        { provide: PANEL_DEFINITIONS_TOKEN, useValue: defs },
        provideBootSnapshot({ boot: { status: 'ready', kv: [], records } as never }),
      ],
    });
  };

  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete (window as { dude?: unknown }).dude;
    resetLocalBackend();
  });

  describe('usage', () => {
    it('debounces opens into one committed document and sees them at once', async () => {
      setup();
      const usage = TestBed.inject(UsageService);
      usage.recordOpen('base64');
      usage.recordOpen('base64');
      usage.recordOpen('json');
      expect(usage.frequencyOf('base64')).toBe(2);
      expect(commits).toEqual([]);

      await vi.advanceTimersByTimeAsync(USAGE_COMMIT_DEBOUNCE_MS);
      expect(commits).toHaveLength(1);
      expect(commits[0]).toMatchObject({ entityType: 'usage', entityId: 'default', op: 'upsert' });
      expect((commits[0].payload as { counts: Record<string, { count: number }> }).counts['base64'].count).toBe(2);
      expect(usage.frequencyOf('base64')).toBe(2);
    });

    it('commits pending opens when the store asks for a flush', async () => {
      setup();
      const usage = TestBed.inject(UsageService);
      usage.recordOpen('base64');
      expect(commits).toEqual([]);

      await Promise.all(flushCallbacks.map((callback) => callback()));
      expect(commits).toHaveLength(1);
      expect(commits[0]).toMatchObject({ entityType: 'usage', op: 'upsert' });

      await vi.advanceTimersByTimeAsync(USAGE_COMMIT_DEBOUNCE_MS * 2);
      expect(commits).toHaveLength(1);
    });

    it('hydrates from the stored document', () => {
      const stored = { schemaVersion: 2, counts: { json: { count: 7, lastUsedAt: '2026-01-01T00:00:00.000Z' } }, recentLog: [], dailyBuckets: [], trackingStartedOn: null };
      setup([{ entityType: 'usage', entityId: 'default', payload: stored }]);
      expect(TestBed.inject(UsageService).frequencyOf('json')).toBe(7);
    });
  });

  describe('home layout', () => {
    it('commits a validated save as the single home-layout record', async () => {
      setup();
      const service = TestBed.inject(HomeLayoutService);
      const base = service.layout();
      const result = service.save({
        instances: base.instances,
        wide: [{ id: 'rail', x: 0, y: 0, w: 12, h: 2 }],
        narrow: [{ id: 'rail', x: 0, y: 0, w: 12, h: 2 }],
        narrowCustomized: true,
        content: {},
      });
      expect(result.ok).toBe(true);
      expect(service.customized()).toBe(true);
      await vi.waitFor(() => expect(commits).toHaveLength(1));
      expect(commits[0]).toMatchObject({ entityType: 'home-layout', entityId: 'default', op: 'upsert' });
      expect(commits[0].payload).toMatchObject({ schemaVersion: 1, customized: true });
    });

    it('stores nothing for an untouched layout', async () => {
      setup();
      const service = TestBed.inject(HomeLayoutService);
      expect(service.customized()).toBe(false);
      await vi.advanceTimersByTimeAsync(5000);
      expect(commits).toEqual([]);
    });

    it('reads a newer-schema record without ever writing it on load', async () => {
      setup([{ entityType: 'home-layout', entityId: 'default', payload: newerDoc }]);
      const service = TestBed.inject(HomeLayoutService);
      expect(service.customized()).toBe(true);
      expect(service.layout().instances.map((i) => i.id)).toEqual(['rail']);
      await vi.advanceTimersByTimeAsync(5000);
      expect(commits).toEqual([]);
    });
  });
});
