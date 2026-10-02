import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PreviewBackground, normalizePreviewBackground, previewBackgroundStyle } from "@dude/tool-engine/shared/components/preview-background/preview-background-style";
import { PreviewBackgroundChips, PreviewBackgroundTarget } from './preview-background';

describe('previewBackgroundStyle', () => {
  it('follows the theme panel token for theme', () => {
    expect(previewBackgroundStyle('theme').backgroundColor).toBe('var(--color-panel)');
  });

  it('uses fixed neutrals for white and dark', () => {
    expect(previewBackgroundStyle('white').backgroundColor).toBe('#ffffff');
    expect(previewBackgroundStyle('dark').backgroundColor).not.toBe('var(--color-panel)');
    expect(previewBackgroundStyle('dark').backgroundImage).toBe('none');
  });

  it('builds a conic-gradient checkerboard for checker', () => {
    const style = previewBackgroundStyle('checker');
    expect(style.backgroundImage).toContain('repeating-conic-gradient');
    expect(style.backgroundSize).toBe('16px 16px');
  });

  it('normalizes unknown values to theme', () => {
    expect(normalizePreviewBackground('sepia')).toBe('theme');
    expect(normalizePreviewBackground(undefined)).toBe('theme');
    expect(normalizePreviewBackground('checker')).toBe('checker');
  });
});

@Component({
  imports: [PreviewBackgroundChips, PreviewBackgroundTarget],
  template: `
    <app-preview-background [(value)]="mode" />
    <div id="target" [appPreviewBackground]="mode()"></div>
  `,
})
class Host {
  readonly mode = signal<PreviewBackground>('theme');
}

describe('PreviewBackgroundChips', () => {
  it('renders four pressed-state chips, defaults to Theme, and drives the target', () => {
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const buttons = Array.from(el.querySelectorAll('button'));

    expect(el.querySelector('[role="group"]')?.getAttribute('aria-label')).toBe('Preview background');
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Theme', 'White', 'Dark', 'Checker']);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false', 'false']);
    expect(buttons.every((b) => b.type === 'button')).toBe(true);

    buttons[3].click();
    fixture.detectChanges();
    expect(fixture.componentInstance.mode()).toBe('checker');
    expect(buttons[3].getAttribute('aria-pressed')).toBe('true');
    expect((el.querySelector('#target') as HTMLElement).style.backgroundImage).toContain('repeating-conic-gradient');
  });
});
