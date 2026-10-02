import { TestBed } from '@angular/core/testing';
import { ConnectivityService } from './connectivity.service';

describe('ConnectivityService', () => {
  let service: ConnectivityService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ConnectivityService);
  });

  it('reflects navigator.onLine initially', () => {
    expect(service.online()).toBe(navigator.onLine);
  });

  it('flips to false on a window "offline" event', () => {
    window.dispatchEvent(new Event('offline'));
    expect(service.online()).toBe(false);
  });

  it('flips back to true on a window "online" event', () => {
    window.dispatchEvent(new Event('offline'));
    window.dispatchEvent(new Event('online'));
    expect(service.online()).toBe(true);
  });
});
