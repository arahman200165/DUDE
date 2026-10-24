import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresenceActivity } from '@dude/contracts/hub';
import { PRESENCE_PORT, type PresencePort } from './presence.port';
import { PRESENCE_DEBOUNCE_MS, PresenceService } from './presence.service';

describe('PresenceService', () => {
  let sent: (PresenceActivity | null)[];
  let router: Router;

  const setup = (port: PresencePort | null): PresenceService => {
    TestBed.configureTestingModule({
      providers: [provideRouter([{ path: '**', children: [] }]), { provide: PRESENCE_PORT, useValue: port }],
    });
    router = TestBed.inject(Router);
    return TestBed.inject(PresenceService);
  };
  const go = async (url: string): Promise<void> => {
    await router.navigateByUrl(url);
    TestBed.tick();
  };
  const settle = async (ms = PRESENCE_DEBOUNCE_MS): Promise<void> => {
    await vi.advanceTimersByTimeAsync(ms);
    TestBed.tick();
  };

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.useFakeTimers();
    sent = [];
  });
  afterEach(() => vi.useRealTimers());

  it('shares nothing while the setting is off (the default)', async () => {
    const service = setup({ setActivity: (a) => sent.push(a) });
    expect(service.shareActivity()).toBe(false);
    await go('/tools/base64');
    await settle(PRESENCE_DEBOUNCE_MS * 3);
    expect(sent).toEqual([]);
  });

  it('sends the current activity once after the debounce when the setting turns on', async () => {
    const service = setup({ setActivity: (a) => sent.push(a) });
    await go('/tools/base64');
    service.shareActivity.set(true);
    TestBed.tick();
    await settle(PRESENCE_DEBOUNCE_MS - 1);
    expect(sent).toEqual([]);
    await settle(1);
    expect(sent).toEqual([{ kind: 'tool', id: 'base64' }]);
  });

  it('debounces a burst of navigations to the last one and never repeats an unchanged activity', async () => {
    const service = setup({ setActivity: (a) => sent.push(a) });
    service.shareActivity.set(true);
    TestBed.tick();
    await go('/tools/base64');
    await settle(PRESENCE_DEBOUNCE_MS / 2);
    await go('/settings/appearance');
    await settle(PRESENCE_DEBOUNCE_MS / 2);
    expect(sent).toEqual([]);
    await settle(PRESENCE_DEBOUNCE_MS / 2);
    expect(sent).toEqual([{ kind: 'destination', id: 'settings' }]);
    // Another settings page is the same activity: nothing more is sent.
    await go('/settings/general');
    await settle(PRESENCE_DEBOUNCE_MS * 2);
    expect(sent).toHaveLength(1);
    await go('/tools/base64');
    await settle();
    expect(sent.at(-1)).toEqual({ kind: 'tool', id: 'base64' });
    expect(sent).toHaveLength(2);
  });

  it('sends null once, immediately, when the setting turns off, and nothing after', async () => {
    const service = setup({ setActivity: (a) => sent.push(a) });
    service.shareActivity.set(true);
    TestBed.tick();
    await go('/tools/base64');
    await settle();
    expect(sent).toHaveLength(1);
    service.shareActivity.set(false);
    TestBed.tick();
    expect(sent.at(-1)).toBeNull();
    expect(sent).toHaveLength(2);
    await go('/history');
    await settle(PRESENCE_DEBOUNCE_MS * 3);
    expect(sent).toHaveLength(2);
  });

  it('sends nothing when turned on and off again before anything was shared', async () => {
    const service = setup({ setActivity: (a) => sent.push(a) });
    await go('/history');
    service.shareActivity.set(true);
    TestBed.tick();
    await settle(PRESENCE_DEBOUNCE_MS / 2);
    service.shareActivity.set(false);
    TestBed.tick();
    await settle(PRESENCE_DEBOUNCE_MS * 2);
    expect(sent).toEqual([]);
  });

  it('is unavailable and inert without a port', async () => {
    const service = setup(null);
    expect(service.available).toBe(false);
    service.shareActivity.set(true);
    await go('/tools/base64');
    await settle(PRESENCE_DEBOUNCE_MS * 2);
    expect(sent).toEqual([]);
  });

  it('survives a port that throws', async () => {
    const service = setup({ setActivity: () => { throw new Error('bridge gone'); } });
    service.shareActivity.set(true);
    TestBed.tick();
    await go('/history');
    await expect(settle()).resolves.toBeUndefined();
  });
});
