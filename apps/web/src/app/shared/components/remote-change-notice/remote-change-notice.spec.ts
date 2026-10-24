import { TestBed } from '@angular/core/testing';
import { RemoteChangeNotice } from './remote-change-notice';

describe('RemoteChangeNotice', () => {
  function render(kind: 'conflict' | 'deleted' | null) {
    const fixture = TestBed.createComponent(RemoteChangeNotice);
    fixture.componentRef.setInput('kind', kind);
    fixture.detectChanges();
    return fixture;
  }

  it('keeps an empty polite live region when there is nothing to say', () => {
    const el = render(null).nativeElement as HTMLElement;
    const region = el.querySelector('[role="status"]');
    expect(region?.getAttribute('aria-live')).toBe('polite');
    expect(region?.textContent?.trim()).toBe('');
  });

  it('offers both choices on a conflict and emits them', () => {
    const fixture = render('conflict');
    const useOther = vi.fn();
    const keep = vi.fn();
    fixture.componentInstance.useOther.subscribe(useOther);
    fixture.componentInstance.keepEditing.subscribe(keep);
    const buttons = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll('button'));
    expect(buttons.map((b) => b.textContent?.trim())).toEqual(['Use the other version', 'Keep editing']);
    buttons[0].click();
    buttons[1].click();
    expect(useOther).toHaveBeenCalledOnce();
    expect(keep).toHaveBeenCalledOnce();
  });

  it('only offers dismissing a deletion', () => {
    const el = render('deleted').nativeElement as HTMLElement;
    expect(el.textContent).toContain('Deleted on another device');
    expect(Array.from(el.querySelectorAll('button')).map((b) => b.textContent?.trim())).toEqual(['Dismiss']);
  });
});
