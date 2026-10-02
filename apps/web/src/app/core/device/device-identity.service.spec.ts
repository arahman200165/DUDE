import { TestBed } from '@angular/core/testing';
import { PersistenceService } from '../persistence/persistence.service';
import { provideBootSnapshot } from '../persistence/device-store/boot-snapshot';
import { fakeElectronBridge } from '../platform/testing/fake-electron-bridge';
import { DeviceIdentityService, INSTALLATION_STORAGE_KEY } from './device-identity.service';

describe('DeviceIdentityService', () => {
  const originalDude = window.dude;
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    Object.defineProperty(window, 'dude', { value: originalDude, configurable: true });
    localStorage.clear();
  });

  it('web: mints an installation record once and reuses it', () => {
    Object.defineProperty(window, 'dude', { value: undefined, configurable: true });
    const first = TestBed.inject(DeviceIdentityService).identity()!;
    expect(first.platform).toBe('web');
    expect(first.deviceId).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.environmentId).not.toBe(first.deviceId);
    expect(JSON.parse(localStorage.getItem(INSTALLATION_STORAGE_KEY)!).deviceId).toBe(first.deviceId);

    TestBed.resetTestingModule();
    expect(TestBed.inject(DeviceIdentityService).identity()!.deviceId).toBe(first.deviceId);
  });

  it('web: clearAll keeps the installation record', () => {
    Object.defineProperty(window, 'dude', { value: undefined, configurable: true });
    const id = TestBed.inject(DeviceIdentityService).identity()!.deviceId;
    localStorage.setItem('dude:v1:json:indent', '2');
    TestBed.inject(PersistenceService).clearAll();
    expect(localStorage.getItem('dude:v1:json:indent')).toBeNull();
    expect(JSON.parse(localStorage.getItem(INSTALLATION_STORAGE_KEY)!).deviceId).toBe(id);
  });

  it('desktop: uses the boot snapshot device and renames through the bridge', async () => {
    const bridge = fakeElectronBridge();
    Object.defineProperty(window, 'dude', { value: bridge, configurable: true });
    const boot = await bridge.store.hydrate();
    TestBed.configureTestingModule({ providers: [provideBootSnapshot({ boot })] });
    const service = TestBed.inject(DeviceIdentityService);
    expect(service.identity()!.deviceId).toBe('fake-device');
    expect(localStorage.getItem(INSTALLATION_STORAGE_KEY)).toBeNull();
    expect(await service.rename('Work PC')).toEqual({ ok: true, displayName: 'Work PC' });
    expect(service.identity()!.displayName).toBe('Work PC');
    expect((await bridge.device.get())?.displayName).toBe('Work PC');
  });

  it('desktop with a degraded store: identity is null and status unavailable, no web record is minted', async () => {
    Object.defineProperty(window, 'dude', { value: fakeElectronBridge(), configurable: true });
    TestBed.configureTestingModule({ providers: [provideBootSnapshot({ boot: { status: 'degraded', device: null, kv: [], records: [] } })] });
    const service = TestBed.inject(DeviceIdentityService);
    expect(service.identity()).toBeNull();
    expect(service.status()).toBe('unavailable');
    expect(localStorage.getItem(INSTALLATION_STORAGE_KEY)).toBeNull();
    expect(await service.rename('Work PC')).toMatchObject({ ok: false });
  });
});
