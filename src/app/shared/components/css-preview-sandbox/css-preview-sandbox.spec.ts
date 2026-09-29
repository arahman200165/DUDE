import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppearanceService } from '../../../core/appearance/appearance.service';
import { CssPreviewSandbox } from './css-preview-sandbox';

describe('CssPreviewSandbox', () => {
  const motionPref = signal('allow');

  beforeEach(() => {
    motionPref.set('allow');
    TestBed.configureTestingModule({
      providers: [{ provide: AppearanceService, useValue: { effective: () => ({ motion: motionPref() }) } }],
    });
  });

  function create(motion: boolean) {
    const fixture = TestBed.createComponent(CssPreviewSandbox);
    fixture.componentRef.setInput('css', '.a{animation:x 1s infinite}');
    fixture.componentRef.setInput('motion', motion);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      root,
      button: () => root.querySelector('button') as HTMLButtonElement | null,
      srcdoc: () => (root.querySelector('iframe') as HTMLIFrameElement).getAttribute('srcdoc') ?? '',
    };
  }

  it('starts paused with a Play button when motion is reduced', () => {
    motionPref.set('reduce');
    const c = create(true);
    expect(c.root.hasAttribute('data-motion-exempt')).toBe(true);
    expect(c.button()?.textContent).toContain('Play');
    expect(c.button()?.getAttribute('aria-pressed')).toBe('false');
    expect(c.srcdoc()).toContain('animation-play-state:paused');
  });

  it('resumes on click, shows Pause and keeps playing across css edits', () => {
    motionPref.set('reduce');
    const c = create(true);
    c.button()!.click();
    c.fixture.detectChanges();
    expect(c.srcdoc()).not.toContain('animation-play-state');
    expect(c.button()?.textContent).toContain('Pause');
    expect(c.button()?.getAttribute('aria-pressed')).toBe('true');
    c.fixture.componentRef.setInput('css', '.b{}');
    c.fixture.detectChanges();
    expect(c.srcdoc()).not.toContain('animation-play-state');
  });

  it('does not auto-resume when css changes while paused', () => {
    motionPref.set('reduce');
    const c = create(true);
    c.fixture.componentRef.setInput('css', '.b{}');
    c.fixture.detectChanges();
    expect(c.srcdoc()).toContain('animation-play-state:paused');
  });

  it('has no pause and no button when motion is allowed', () => {
    const c = create(true);
    expect(c.root.hasAttribute('data-motion-exempt')).toBe(true);
    expect(c.button()).toBeNull();
    expect(c.srcdoc()).not.toContain('animation-play-state');
  });

  it('is inert when the motion input is false', () => {
    motionPref.set('reduce');
    const c = create(false);
    expect(c.root.hasAttribute('data-motion-exempt')).toBe(false);
    expect(c.button()).toBeNull();
    expect(c.srcdoc()).not.toContain('animation-play-state');
  });
});
