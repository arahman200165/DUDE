import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { SwUpdate, VersionEvent } from '@angular/service-worker';
import { UpdateService } from './update.service';

class FakeSwUpdate {
  readonly versionUpdates = new Subject<VersionEvent>();
  isEnabled = true;
  activateUpdate = vi.fn().mockResolvedValue(true);
  checkForUpdate = vi.fn().mockResolvedValue(false);
}

describe('UpdateService', () => {
  let service: UpdateService;
  let fakeSwUpdate: FakeSwUpdate;

  beforeEach(() => {
    fakeSwUpdate = new FakeSwUpdate();
    TestBed.configureTestingModule({
      providers: [{ provide: SwUpdate, useValue: fakeSwUpdate }],
    });
    service = TestBed.inject(UpdateService);
  });

  it('is not ready before any version event', () => {
    expect(service.updateReady()).toBe(false);
  });

  it('becomes ready on a VERSION_READY event', () => {
    fakeSwUpdate.versionUpdates.next({ type: 'VERSION_READY' } as VersionEvent);
    expect(service.updateReady()).toBe(true);
  });

  it('activateUpdate reloads the page when the service worker is enabled', async () => {
    const reload = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload });

    await service.activateUpdate();

    expect(fakeSwUpdate.activateUpdate).toHaveBeenCalled();
    expect(reload).toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('activateUpdate does nothing when the service worker is disabled', async () => {
    fakeSwUpdate.isEnabled = false;

    await service.activateUpdate();

    expect(fakeSwUpdate.activateUpdate).not.toHaveBeenCalled();
  });
});

describe('UpdateService periodic update check', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls checkForUpdate on an interval when the service worker is enabled', () => {
    vi.useFakeTimers();
    const fakeSwUpdate = new FakeSwUpdate();
    TestBed.configureTestingModule({ providers: [{ provide: SwUpdate, useValue: fakeSwUpdate }] });
    TestBed.inject(UpdateService);

    expect(fakeSwUpdate.checkForUpdate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(6 * 60 * 60 * 1000);

    expect(fakeSwUpdate.checkForUpdate).toHaveBeenCalledTimes(1);
  });

  it('never polls when the service worker is disabled', () => {
    vi.useFakeTimers();
    const fakeSwUpdate = new FakeSwUpdate();
    fakeSwUpdate.isEnabled = false;
    TestBed.configureTestingModule({ providers: [{ provide: SwUpdate, useValue: fakeSwUpdate }] });
    TestBed.inject(UpdateService);

    vi.advanceTimersByTime(24 * 60 * 60 * 1000);

    expect(fakeSwUpdate.checkForUpdate).not.toHaveBeenCalled();
  });
});

describe('UpdateService repair signal', () => {
  it('flags needsRepair on an unrecoverable state or a failed version install', () => {
    const unrecoverable = new Subject<{ type: 'UNRECOVERABLE_STATE'; reason: string }>();
    const fake = Object.assign(new FakeSwUpdate(), { unrecoverable });
    TestBed.configureTestingModule({ providers: [{ provide: SwUpdate, useValue: fake }] });
    const service = TestBed.inject(UpdateService);

    expect(service.needsRepair()).toBe(false);
    fake.versionUpdates.next({ type: 'VERSION_INSTALLATION_FAILED' } as VersionEvent);
    expect(service.needsRepair()).toBe(true);

    fake.versionUpdates.next({ type: 'NO_NEW_VERSION_DETECTED' } as VersionEvent);
    expect(service.needsRepair()).toBe(false);
    unrecoverable.next({ type: 'UNRECOVERABLE_STATE', reason: 'hash mismatch' });
    expect(service.needsRepair()).toBe(true);
  });
});
