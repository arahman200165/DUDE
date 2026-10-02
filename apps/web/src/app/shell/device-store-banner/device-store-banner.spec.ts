import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { DeviceStoreHealthService } from '../../core/device/device-store-health.service';
import { DeviceStoreBanner } from './device-store-banner';

function setup(state: { degraded: boolean; status: string | null }) {
  const retry = vi.fn(async () => undefined);
  const status = signal(state.status);
  TestBed.configureTestingModule({
    providers: [
      provideRouter([]),
      { provide: DeviceStoreHealthService, useValue: { degraded: () => state.degraded, status, degradedReason: () => null, retrying: () => false, retry } },
    ],
  });
  const fixture = TestBed.createComponent(DeviceStoreBanner);
  fixture.detectChanges();
  return { fixture, retry, el: fixture.nativeElement as HTMLElement };
}

describe('DeviceStoreBanner', () => {
  it('is hidden when the store is healthy or on web', () => {
    expect(setup({ degraded: false, status: null }).el.querySelector('[role="alert"]')).toBeNull();
  });

  it('shows the headline and a per-status reason', () => {
    const { el } = setup({ degraded: true, status: 'incompatible' });
    expect(el.textContent).toContain("Device Store unavailable — changes won't be saved.");
    expect(el.textContent).toContain('This store was written by a newer DUDE version.');
  });

  it('explains a corrupt store', () => {
    expect(setup({ degraded: true, status: 'corrupt' }).el.textContent).toContain('The store file is damaged.');
  });

  it('Retry calls the health service and Details opens Settings', () => {
    const { el, retry } = setup({ degraded: true, status: 'unavailable' });
    const navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    const [retryButton, detailsButton] = Array.from(el.querySelectorAll('button'));
    retryButton.click();
    expect(retry).toHaveBeenCalled();
    detailsButton.click();
    expect(navigate).toHaveBeenCalledWith('/settings/device');
  });
});
