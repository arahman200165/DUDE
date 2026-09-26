import { TestBed } from '@angular/core/testing';
import { NativeRecentsService } from './native-recents.service';

describe('NativeRecentsService', () => {
  let service: NativeRecentsService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    service = TestBed.inject(NativeRecentsService);
  });

  it('starts empty and enabled', () => {
    expect(service.entries()).toEqual([]);
    expect(service.enabled()).toBe(true);
  });

  it('records an opened file', () => {
    service.record({ path: 'C:/a.txt', name: 'a.txt', extension: '.txt', openedAt: '2026-01-01T00:00:00.000Z' });
    expect(service.entries().map((e) => e.path)).toEqual(['C:/a.txt']);
  });

  it('does not record while opted out', () => {
    service.enabled.set(false);
    service.record({ path: 'C:/a.txt', name: 'a.txt', extension: '.txt', openedAt: '2026-01-01T00:00:00.000Z' });
    expect(service.entries()).toEqual([]);
  });

  it('opting out does not retroactively purge already-recorded entries', () => {
    service.record({ path: 'C:/a.txt', name: 'a.txt', extension: '.txt', openedAt: '2026-01-01T00:00:00.000Z' });
    service.enabled.set(false);
    expect(service.entries().length).toBe(1);
  });

  it('removes a single entry by path', () => {
    service.record({ path: 'C:/a.txt', name: 'a.txt', extension: '.txt', openedAt: '2026-01-01T00:00:00.000Z' });
    service.record({ path: 'C:/b.txt', name: 'b.txt', extension: '.txt', openedAt: '2026-01-01T00:00:00.000Z' });

    service.remove('C:/a.txt');

    expect(service.entries().map((e) => e.path)).toEqual(['C:/b.txt']);
  });

  it('clears all entries', () => {
    service.record({ path: 'C:/a.txt', name: 'a.txt', extension: '.txt', openedAt: '2026-01-01T00:00:00.000Z' });
    service.clearAll();
    expect(service.entries()).toEqual([]);
  });
});
