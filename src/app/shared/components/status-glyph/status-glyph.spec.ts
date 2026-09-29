import { TestBed } from '@angular/core/testing';
import { StatusGlyph, StatusGlyphKind } from './status-glyph';

const KINDS: readonly StatusGlyphKind[] = ['error', 'warning', 'success', 'info', 'busy', 'offline', 'idle', 'cancelled', 'neutral'];

function render(kind: StatusGlyphKind): HTMLElement {
  const fixture = TestBed.createComponent(StatusGlyph);
  fixture.componentRef.setInput('kind', kind);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('StatusGlyph', () => {
  it('renders an aria-hidden svg with no text for every kind', () => {
    for (const kind of KINDS) {
      const host = render(kind);
      const svg = host.querySelector('svg');
      expect(svg?.getAttribute('aria-hidden')).toBe('true');
      expect(host.textContent?.trim()).toBe('');
      expect(host.getAttribute('data-glyph')).toBe(kind);
    }
  });

  it('draws a distinct shape per kind', () => {
    const shapes = new Set(KINDS.map((kind) => render(kind).querySelector('svg')?.innerHTML.replace(/<!--.*?-->/g, '').trim()));
    expect(shapes.size).toBe(KINDS.length);
  });
});
