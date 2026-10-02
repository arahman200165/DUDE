import { TestBed } from '@angular/core/testing';
import { HomePasteDropHero } from './home-paste-drop-hero';

describe('HomePasteDropHero', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('starts collapsed, showing only the idle affordance', () => {
    const fixture = TestBed.createComponent(HomePasteDropHero);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="button"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-paste-detect-panel')).toBeNull();
  });

  it('expands on focus of the idle row', () => {
    const fixture = TestBed.createComponent(HomePasteDropHero);
    fixture.detectChanges();

    (fixture.nativeElement.querySelector('[role="button"]') as HTMLElement).dispatchEvent(new FocusEvent('focus'));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('app-paste-detect-panel')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-smart-file-drop-zone')).not.toBeNull();
  });

  it('forwards clipboard text pasted on the idle row into the expanded panel', () => {
    const fixture = TestBed.createComponent(HomePasteDropHero);
    fixture.detectChanges();

    const pasteEvent = new Event('paste');
    Object.defineProperty(pasteEvent, 'clipboardData', { value: { getData: () => 'pasted content' } });
    (fixture.nativeElement.querySelector('[role="button"]') as HTMLElement).dispatchEvent(pasteEvent);
    fixture.detectChanges();

    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    expect(textarea.value).toBe('pasted content');
  });

  it('collapses back to idle when Escape is pressed with no content', () => {
    const fixture = TestBed.createComponent(HomePasteDropHero);
    fixture.detectChanges();
    fixture.componentInstance['expand']();
    fixture.detectChanges();

    const section = fixture.nativeElement.querySelector('section') as HTMLElement;
    section.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('[role="button"]')).not.toBeNull();
    expect(fixture.nativeElement.querySelector('app-paste-detect-panel')).toBeNull();
  });
  it('moves focus into the paste box when the idle row is focused, and back to the idle row on Escape', async () => {
    const fixture = TestBed.createComponent(HomePasteDropHero);
    document.body.appendChild(fixture.nativeElement);
    try {
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('[role="button"]') as HTMLElement).focus();
      fixture.detectChanges();
      await fixture.whenStable();

      const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
      expect(document.activeElement).toBe(textarea);

      textarea.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      fixture.detectChanges();
      await fixture.whenStable();

      expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
      const row = fixture.nativeElement.querySelector('[role="button"]') as HTMLElement;
      expect(document.activeElement).toBe(row);
    } finally {
      fixture.nativeElement.remove();
    }
  });
});
