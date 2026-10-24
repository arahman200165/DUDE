import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import type { PresenceActivity, PresenceEntry } from '@dude/contracts/hub';
import { HubWebPresence } from '../hub-web/hub-web-presence';
import { PlatformService } from '../platform/platform.service';
import { PLATFORM_BRIDGE } from '../platform/platform-bridge.adapter';
import { PRESENCE_PORT, createDesktopPresenceAdapter, createHubWebPresenceAdapter } from './presence.port';

const tool: PresenceActivity = { kind: 'tool', id: 'base64' };

describe('presence ports', () => {
  it('desktop adapter hands the activity to the bridge and swallows a failed call', async () => {
    const setActivity = vi.fn(async () => { throw new Error('ipc closed'); });
    const port = createDesktopPresenceAdapter(() => ({ setActivity }));
    port.setActivity(tool);
    port.setActivity(null);
    await Promise.resolve();
    expect(setActivity.mock.calls).toEqual([[tool], [null]]);
  });

  it('desktop adapter does nothing while the bridge is absent', () => {
    expect(() => createDesktopPresenceAdapter(() => undefined).setActivity(tool)).not.toThrow();
  });

  it('Hub web adapter reports to the realtime link seam, which holds the latest value until the link binds', () => {
    const link = new HubWebPresence();
    createHubWebPresenceAdapter(link).setActivity(tool);
    expect(link.activity).toEqual(tool);
    const sink = vi.fn();
    const unbind = link.bind(sink);
    expect(sink).toHaveBeenCalledWith(tool);
    link.setActivity(null);
    expect(sink).toHaveBeenLastCalledWith(null);
    unbind();
    link.setActivity(tool);
    expect(sink).toHaveBeenCalledTimes(2);
  });

  it('HubWebPresence binds without sending when nothing was asked, and a throwing listener does not break the others', () => {
    const link = new HubWebPresence();
    const sink = vi.fn();
    link.bind(sink);
    expect(sink).not.toHaveBeenCalled();
    const seen: PresenceEntry[] = [];
    link.subscribe(() => { throw new Error('bad listener'); });
    const off = link.subscribe((entry) => seen.push(entry));
    link.notify({ deviceId: 'd1', online: true, activity: null });
    off();
    link.notify({ deviceId: 'd2', online: true, activity: null });
    expect(seen).toEqual([{ deviceId: 'd1', online: true, activity: null }]);
  });

  describe('PRESENCE_PORT token', () => {
    const configure = (hostKind: 'desktop' | 'hub-web' | 'web', bridge: unknown): void => {
      TestBed.configureTestingModule({
        providers: [
          { provide: PlatformService, useValue: { hostKind } },
          { provide: PLATFORM_BRIDGE, useValue: { get: () => bridge } },
        ],
      });
    };

    it('is null on the standalone web build and on a desktop without the presence bridge', () => {
      configure('web', undefined);
      expect(TestBed.inject(PRESENCE_PORT)).toBeNull();
      TestBed.resetTestingModule();
      configure('desktop', {});
      expect(TestBed.inject(PRESENCE_PORT)).toBeNull();
    });

    it('is the desktop adapter when the bridge has presence, and the realtime adapter on Hub web', () => {
      const setActivity = vi.fn(async () => ({ ok: true as const, result: { ok: true as const } }));
      configure('desktop', { presence: { setActivity } });
      TestBed.inject(PRESENCE_PORT)!.setActivity(tool);
      expect(setActivity).toHaveBeenCalledWith(tool);
      TestBed.resetTestingModule();
      configure('hub-web', undefined);
      TestBed.inject(PRESENCE_PORT)!.setActivity(tool);
      expect(TestBed.inject(HubWebPresence).activity).toEqual(tool);
    });
  });
});
