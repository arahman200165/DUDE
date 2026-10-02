import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { PasteDetectPanel } from './paste-detect-panel';
import { PasteHandoffService } from '../../../core/paste-detect/paste-handoff.service';

class FakeRouter {
  url = '/';
  navigateByUrl = vi.fn();
}

describe('PasteDetectPanel', () => {
  let router: FakeRouter;

  beforeEach(() => {
    router = new FakeRouter();
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: router }] });
  });

  function setInput(fixture: ReturnType<typeof TestBed.createComponent<PasteDetectPanel>>, value: string): void {
    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    textarea.value = value;
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();
  }

  it('shows no matches for an empty input', () => {
    const fixture = TestBed.createComponent(PasteDetectPanel);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).not.toContain('Open in');
  });

  it('shows a match for a recognized shape', () => {
    const fixture = TestBed.createComponent(PasteDetectPanel);
    fixture.detectChanges();

    setInput(fixture, '123e4567-e89b-12d3-a456-426614174000');

    expect(fixture.nativeElement.textContent).toContain('UUID');
  });

  it('offers the value via PasteHandoffService and navigates when a match is opened', () => {
    const fixture = TestBed.createComponent(PasteDetectPanel);
    fixture.detectChanges();
    const handoff = TestBed.inject(PasteHandoffService);

    setInput(fixture, '123e4567-e89b-12d3-a456-426614174000');
    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    button.click();

    expect(router.navigateByUrl).toHaveBeenCalledWith('/tools/uuid');
    expect(handoff.consume('uuid')).toBe('123e4567-e89b-12d3-a456-426614174000');
  });

  it('clear() resets the input and hides the match list', () => {
    const fixture = TestBed.createComponent(PasteDetectPanel);
    fixture.detectChanges();
    setInput(fixture, '123e4567-e89b-12d3-a456-426614174000');
    expect(fixture.nativeElement.textContent).toContain('UUID');

    fixture.componentInstance.clear();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).not.toContain('Open in');
  });
});
