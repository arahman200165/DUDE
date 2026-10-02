import { TestBed } from '@angular/core/testing';
import { ShortcutHint } from './shortcut-hint';

describe('ShortcutHint', () => {
  it('defaults to "Ctrl+K"', () => {
    const fixture = TestBed.createComponent(ShortcutHint);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe('Ctrl+K');
  });

  it('renders a custom label when given one', () => {
    const fixture = TestBed.createComponent(ShortcutHint);
    fixture.componentRef.setInput('label', 'Ctrl+P');
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent?.trim()).toBe('Ctrl+P');
  });
});
