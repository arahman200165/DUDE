import { TestBed } from '@angular/core/testing';
import { BusyIndicator, BusyIndicatorStatus } from './busy-indicator';

describe('BusyIndicator', () => {
  const CASES: readonly [BusyIndicatorStatus, string, string][] = [
    ['running', 'busy', 'Running'],
    ['done', 'success', 'Done'],
    ['error', 'error', 'Failed'],
    ['cancelled', 'cancelled', 'Cancelled'],
    ['idle', 'idle', 'Idle'],
  ];

  for (const [status, glyph, label] of CASES) {
    it(`pairs the ${status} label with its own aria-hidden ${glyph} glyph`, () => {
      const fixture = TestBed.createComponent(BusyIndicator);
      fixture.componentRef.setInput('status', status);
      fixture.detectChanges();

      const root = fixture.nativeElement as HTMLElement;
      const el = root.querySelector('app-status-glyph');
      expect(el?.getAttribute('data-glyph')).toBe(glyph);
      expect(el?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
      expect(root.textContent).toContain(label);
    });
  }

  it('appends progress to the running label', () => {
    const fixture = TestBed.createComponent(BusyIndicator);
    fixture.componentRef.setInput('status', 'running');
    fixture.componentRef.setInput('progress', 40);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Running — 40%');
  });
});
