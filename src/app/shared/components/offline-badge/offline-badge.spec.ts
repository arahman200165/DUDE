import { TestBed } from '@angular/core/testing';
import { OfflineBadge } from './offline-badge';

describe('OfflineBadge', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({});
  });

  it('renders the offline label by default', () => {
    const fixture = TestBed.createComponent(OfflineBadge);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Offline');
  });

  it('renders nothing when show is false', () => {
    const fixture = TestBed.createComponent(OfflineBadge);
    fixture.componentRef.setInput('show', false);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });
});

describe('OfflineBadge glyph', () => {
  it('pairs the Offline label with an aria-hidden offline glyph', () => {
    const fixture = TestBed.createComponent(OfflineBadge);
    fixture.detectChanges();
    const glyph = (fixture.nativeElement as HTMLElement).querySelector('app-status-glyph');
    expect(glyph?.getAttribute('data-glyph')).toBe('offline');
    expect(glyph?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
  });
});
