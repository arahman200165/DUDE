import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { PLATFORM_BRIDGE } from '../platform/platform-bridge.adapter';
import { PlatformService } from '../platform/platform.service';
import { HUB_COLLAB, UNAVAILABLE_COLLAB_TRANSPORT } from './hub-collab.token';

describe('HUB_COLLAB default (PD-114)', () => {
  const configure = (hostKind: 'desktop' | 'hub-web' | 'web', bridge: unknown): void => {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [{ provide: PlatformService, useValue: { hostKind } }, { provide: PLATFORM_BRIDGE, useValue: { get: () => bridge } }],
    });
  };

  it('is the Agent relay on a desktop build whose bridge has collabHub, editable while down', () => {
    configure('desktop', { collabHub: {} });
    const transport = TestBed.inject(HUB_COLLAB);
    expect(transport).not.toBe(UNAVAILABLE_COLLAB_TRANSPORT);
    expect(transport.editableWhenDown).toBe(true);
  });

  it('is unavailable on a desktop build without the bridge, on Pages and standalone web', () => {
    for (const [hostKind, bridge] of [['desktop', {}], ['desktop', undefined], ['web', { collabHub: {} }]] as const) {
      configure(hostKind, bridge);
      expect(TestBed.inject(HUB_COLLAB)).toBe(UNAVAILABLE_COLLAB_TRANSPORT);
    }
  });
});
