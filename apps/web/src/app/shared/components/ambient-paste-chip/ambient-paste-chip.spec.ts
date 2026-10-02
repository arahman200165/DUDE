import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { AmbientPasteChip } from './ambient-paste-chip';
import { fakeElectronBridge } from '../../../core/platform/testing/fake-electron-bridge';

class FakeRouter {
  url = '/';
  navigateByUrl = vi.fn();
}

const A_UUID = '123e4567-e89b-12d3-a456-426614174000';

function firePaste(target: HTMLElement, text: string | undefined): void {
  const event = new Event('paste', { bubbles: true, cancelable: true }) as ClipboardEvent;
  Object.defineProperty(event, 'clipboardData', {
    value: text === undefined ? null : { getData: () => text },
    configurable: true,
  });
  target.dispatchEvent(event);
}

describe('AmbientPasteChip', () => {
  let router: FakeRouter;

  beforeEach(() => {
    router = new FakeRouter();
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: router }] });
  });

  it('shows a match for a high-confidence shape pasted onto a non-editable target', () => {
    const fixture = TestBed.createComponent(AmbientPasteChip);
    fixture.detectChanges();

    firePaste(document.body, A_UUID);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('UUID');
  });

  it('ignores a paste landing in an input field', () => {
    const fixture = TestBed.createComponent(AmbientPasteChip);
    fixture.detectChanges();

    const input = document.createElement('input');
    document.body.appendChild(input);
    firePaste(input, A_UUID);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe('');
    input.remove();
  });

  it('ignores a paste while already on /smart-paste', () => {
    router.url = '/smart-paste';
    const fixture = TestBed.createComponent(AmbientPasteChip);
    fixture.detectChanges();

    firePaste(document.body, A_UUID);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('ignores a low-confidence shape', () => {
    const fixture = TestBed.createComponent(AmbientPasteChip);
    fixture.detectChanges();

    firePaste(document.body, 'not a recognizable shape at all');
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('dismiss clears the match', () => {
    const fixture = TestBed.createComponent(AmbientPasteChip);
    fixture.detectChanges();
    firePaste(document.body, A_UUID);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('button');
    buttons[buttons.length - 1].click();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  it('opening the match navigates to the matched tool and clears the chip', () => {
    const fixture = TestBed.createComponent(AmbientPasteChip);
    fixture.detectChanges();
    firePaste(document.body, A_UUID);
    fixture.detectChanges();

    const buttons = fixture.nativeElement.querySelectorAll('button');
    buttons[0].click(); // "Open"
    fixture.detectChanges();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/tools/uuid');
    expect(fixture.nativeElement.textContent.trim()).toBe('');
  });

  describe('on desktop', () => {
    const originalDude = window.dude;

    afterEach(() => {
      Object.defineProperty(window, 'dude', { value: originalDude, configurable: true });
    });

    it('signals readiness and shows a match delivered via the global hotkey trigger', () => {
      let trigger: ((text: string) => void) | undefined;
      Object.defineProperty(window, 'dude', {
        value: fakeElectronBridge({
          smartPaste: {
            ready: vi.fn(),
            onTrigger: (callback) => {
              trigger = callback;
              return () => {};
            },
            getHotkey: async () => null,
            setHotkey: async () => ({ ok: true }),
          },
        }),
        configurable: true,
      });

      const fixture = TestBed.createComponent(AmbientPasteChip);
      fixture.detectChanges();

      expect(window.dude!.smartPaste.ready).toHaveBeenCalled();
      trigger?.(A_UUID);
      fixture.detectChanges();

      expect(fixture.nativeElement.textContent).toContain('UUID');
    });
  });
});
