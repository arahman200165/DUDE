import { TestBed } from '@angular/core/testing';
import { LiveRefreshControl } from './live-refresh-control';

describe('LiveRefreshControl', () => {
  afterEach(() => vi.useRealTimers());

  function render() {
    const fixture = TestBed.createComponent(LiveRefreshControl);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, buttons: () => Array.from(el.querySelectorAll('button')) };
  }

  it('toggles pause with aria-pressed and shows Paused status', () => {
    const { fixture, el, buttons } = render();
    const toggle = buttons()[0];
    expect(toggle.textContent?.trim()).toBe('Pause');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.paused()).toBe(true);
    expect(toggle.textContent?.trim()).toBe('Resume');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(el.textContent).toContain('Paused');
  });

  it('offers 1, 2, 5 and 10 s and updates the interval model', () => {
    const { fixture, el } = render();
    const select = el.querySelector('select') as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.textContent?.trim())).toEqual(['1 s', '2 s', '5 s', '10 s']);
    select.value = '5000';
    select.dispatchEvent(new Event('change'));
    expect(fixture.componentInstance.intervalMs()).toBe(5000);
  });

  it('emits refreshRequested from Refresh now', () => {
    const { fixture, buttons } = render();
    const spy = vi.fn();
    fixture.componentInstance.refreshRequested.subscribe(spy);
    buttons()[1].click();
    expect(spy).toHaveBeenCalledOnce();
  });

  it('shows how long ago the last update was', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:10Z'));
    const fixture = TestBed.createComponent(LiveRefreshControl);
    fixture.componentRef.setInput('lastUpdatedAt', Date.now() - 3000);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Updated 3s ago');
    vi.advanceTimersByTime(2000);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Updated 5s ago');
  });
});
