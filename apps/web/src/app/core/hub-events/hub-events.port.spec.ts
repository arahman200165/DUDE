import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesktopHubBridge } from '@dude/contracts/shared/models/platform-bridge.model';
import { PLATFORM_BRIDGE } from '../platform/platform-bridge.adapter';
import { PlatformService } from '../platform/platform.service';
import { HUB_EVENTS, HubEventsFeed, createDesktopHubEvents, createInertHubEvents } from './hub-events.port';
import type { HubViewTopic } from './hub-events.port';
import { HUB_REFETCH_DEBOUNCE_MS, refetchOnHubChange } from './refetch-on-hub-change';

describe('Hub events ports (PD-113)', () => {
  it('the feed delivers a topic only to listeners of that topic and drops an unknown one', () => {
    const feed = new HubEventsFeed();
    const devices: string[] = [];
    const all: string[] = [];
    feed.subscribe(['devices'], (t) => devices.push(t));
    const off = feed.subscribe(['devices', 'backup'], (t) => all.push(t));
    feed.notify('devices');
    feed.notify('backup');
    feed.notify('passwords');
    feed.notify(undefined);
    expect(devices).toEqual(['devices']);
    expect(all).toEqual(['devices', 'backup']);
    off();
    feed.notify('backup');
    expect(all).toHaveLength(2);
  });

  it('a throwing listener does not break the others', () => {
    const feed = new HubEventsFeed();
    const seen: string[] = [];
    feed.subscribe(['sync'], () => { throw new Error('bad page'); });
    feed.subscribe(['sync'], (t) => seen.push(t));
    feed.notify('sync');
    expect(seen).toEqual(['sync']);
  });

  it('the inert adapter never fires', () => {
    const port = createInertHubEvents();
    const listener = vi.fn();
    const off = port.subscribe(['devices', 'sync', 'backup', 'alerts', 'diagnostics', 'jobs'], listener);
    off();
    expect(listener).not.toHaveBeenCalled();
  });

  describe('desktop adapter', () => {
    const makeBridge = () => {
      const handlers = new Set<(topic: HubViewTopic) => void>();
      const onViewChanged = vi.fn((cb: (topic: HubViewTopic) => void) => { handlers.add(cb); return () => { handlers.delete(cb); }; });
      return { bridge: { onViewChanged } as unknown as DesktopHubBridge, handlers, onViewChanged, push: (topic: unknown) => handlers.forEach((h) => h(topic as HubViewTopic)) };
    };

    it('attaches to the bridge while subscribed, filters by topic, drops unknown topics and detaches with the last listener', () => {
      const fake = makeBridge();
      const port = createDesktopHubEvents(() => fake.bridge);
      expect(fake.onViewChanged).not.toHaveBeenCalled();
      const seen: string[] = [];
      const offA = port.subscribe(['devices'], (t) => seen.push(`a:${t}`));
      const offB = port.subscribe(['backup'], (t) => seen.push(`b:${t}`));
      expect(fake.onViewChanged).toHaveBeenCalledTimes(1);
      fake.push('devices');
      fake.push('backup');
      fake.push('nope');
      expect(seen).toEqual(['a:devices', 'b:backup']);
      offA();
      expect(fake.handlers.size).toBe(1);
      offB();
      expect(fake.handlers.size).toBe(0);
    });

    it('is inert while the bridge is absent', () => {
      const port = createDesktopHubEvents(() => undefined);
      expect(() => port.subscribe(['devices'], () => undefined)()).not.toThrow();
    });
  });

  describe('HUB_EVENTS token', () => {
    const configure = (hostKind: 'desktop' | 'hub-web' | 'web', hub: unknown): void => {
      TestBed.configureTestingModule({
        providers: [
          { provide: PlatformService, useValue: { hostKind } },
          { provide: PLATFORM_BRIDGE, useValue: { get: () => ({ hub }) } },
        ],
      });
    };

    it('is the shared feed on Hub web, the bridge on desktop and inert elsewhere', () => {
      configure('hub-web', undefined);
      expect(TestBed.inject(HUB_EVENTS)).toBe(TestBed.inject(HubEventsFeed));
      TestBed.resetTestingModule();
      const onViewChanged = vi.fn(() => () => undefined);
      configure('desktop', { onViewChanged });
      TestBed.inject(HUB_EVENTS).subscribe(['sync'], () => undefined);
      expect(onViewChanged).toHaveBeenCalledTimes(1);
      TestBed.resetTestingModule();
      configure('web', { onViewChanged });
      const listener = vi.fn();
      TestBed.inject(HUB_EVENTS).subscribe(['sync'], listener);
      expect(onViewChanged).toHaveBeenCalledTimes(1);
      expect(listener).not.toHaveBeenCalled();
    });
  });
});

describe('refetchOnHubChange', () => {
  @Component({ selector: 'app-probe', template: '' })
  class Probe {
    readonly refetch = vi.fn();
    allowed = true;
    constructor() {
      refetchOnHubChange(['devices', 'sync'], () => this.refetch(), { when: () => this.allowed });
    }
  }

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: HUB_EVENTS, useExisting: HubEventsFeed }],
    });
  });
  afterEach(() => vi.useRealTimers());

  it('collapses a burst of events into one refetch after the debounce, and ignores other topics', () => {
    const fixture = TestBed.createComponent(Probe);
    const feed = TestBed.inject(HubEventsFeed);
    feed.notify('devices');
    feed.notify('sync');
    feed.notify('devices');
    feed.notify('backup');
    vi.advanceTimersByTime(HUB_REFETCH_DEBOUNCE_MS - 1);
    expect(fixture.componentInstance.refetch).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fixture.componentInstance.refetch).toHaveBeenCalledTimes(1);
    feed.notify('sync');
    vi.advanceTimersByTime(HUB_REFETCH_DEBOUNCE_MS);
    expect(fixture.componentInstance.refetch).toHaveBeenCalledTimes(2);
  });

  it('skips the refetch while `when` is false and drops a pending one on destroy', () => {
    const fixture = TestBed.createComponent(Probe);
    const feed = TestBed.inject(HubEventsFeed);
    fixture.componentInstance.allowed = false;
    feed.notify('devices');
    vi.advanceTimersByTime(HUB_REFETCH_DEBOUNCE_MS);
    expect(fixture.componentInstance.refetch).not.toHaveBeenCalled();
    fixture.componentInstance.allowed = true;
    feed.notify('devices');
    fixture.destroy();
    vi.advanceTimersByTime(HUB_REFETCH_DEBOUNCE_MS * 2);
    expect(fixture.componentInstance.refetch).not.toHaveBeenCalled();
    expect(feed.listening).toBe(0);
  });
});
