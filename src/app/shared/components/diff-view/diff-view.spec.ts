import { TestBed } from '@angular/core/testing';
import { DiffEntry, DiffView } from './diff-view';

describe('DiffView', () => {
  function render(entries: readonly DiffEntry[]): HTMLElement {
    const fixture = TestBed.createComponent(DiffView);
    fixture.componentRef.setInput('entries', entries);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders a fixed-width, aria-hidden gutter marker per op: + add, minus remove, ~ change', () => {
    const root = render([
      { path: '/a', op: 'add', newValue: 1 },
      { path: '/b', op: 'remove', oldValue: 2 },
      { path: '/c', op: 'replace', oldValue: 3, newValue: 4 },
    ]);
    const marker = (op: string) => root.querySelector(`li[data-op="${op}"] [data-gutter]`);
    expect(marker('add')?.textContent?.trim()).toBe('+');
    expect(marker('remove')?.textContent?.trim()).toBe('−');
    expect(marker('replace')?.textContent?.trim()).toBe('~');
    for (const gutter of Array.from(root.querySelectorAll('[data-gutter]'))) {
      expect(gutter.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('marks old values struck through and new values underlined, keeping the op text', () => {
    const root = render([{ path: '/c', op: 'replace', oldValue: 'x', newValue: 'y' }]);
    expect(root.querySelector('.line-through')?.textContent?.trim()).toBe('x');
    expect(root.querySelector('.underline')?.textContent?.trim()).toBe('y');
    expect(root.textContent).toContain('replace');
  });

  it('says so when there are no differences', () => {
    expect(render([]).textContent).toContain('No differences.');
  });
});
