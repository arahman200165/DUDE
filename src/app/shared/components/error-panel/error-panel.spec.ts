import { TestBed } from '@angular/core/testing';
import { ErrorPanel } from './error-panel';

describe('ErrorPanel', () => {
  it('shows an aria-hidden error glyph beside the message text', () => {
    const fixture = TestBed.createComponent(ErrorPanel);
    fixture.componentRef.setInput('message', 'Unexpected token');
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const glyph = root.querySelector('app-status-glyph');
    expect(glyph?.getAttribute('data-glyph')).toBe('error');
    expect(glyph?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.textContent?.trim()).toBe('Unexpected token');
  });

  it('keeps the Retry button when retryable', () => {
    const fixture = TestBed.createComponent(ErrorPanel);
    fixture.componentRef.setInput('message', 'x');
    fixture.componentRef.setInput('retryable', true);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('button')?.textContent?.trim()).toBe('Retry');
  });
});
