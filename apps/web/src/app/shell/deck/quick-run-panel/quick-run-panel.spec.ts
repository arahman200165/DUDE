import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { QuickRunPanel } from './quick-run-panel';
import { FavoritesService } from '../../../core/favorites/favorites.service';
import { UsageService } from '../../../core/usage/usage.service';

class FakeRouter {
  navigateByUrl = vi.fn();
}

describe('QuickRunPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: new FakeRouter() }] });
  });

  it('shows the empty state when there are no favorited/recently-used text-eligible tools', async () => {
    const fixture = TestBed.createComponent(QuickRunPanel);
    fixture.detectChanges();
    await fixture.componentInstance.ensureCandidates();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Favorite or open a text-based tool');
  });

  it('lists a favorited text-eligible tool as a chip and runs it against the shared input', async () => {
    TestBed.inject(FavoritesService).toggleTool('base64');

    const fixture = TestBed.createComponent(QuickRunPanel);
    fixture.detectChanges();
    await fixture.componentInstance.ensureCandidates();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Base64 Encoder / Decoder');

    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    textarea.value = 'aGVsbG8=';
    textarea.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const chip = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (b) => (b as HTMLButtonElement).textContent?.includes('Base64 Encoder / Decoder'),
    ) as HTMLButtonElement;
    chip.click();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('hello');
  });

  it('excludes a favorited tool that has no pipeline step at all', async () => {
    TestBed.inject(FavoritesService).toggleTool('advanced-diff');

    const fixture = TestBed.createComponent(QuickRunPanel);
    fixture.detectChanges();
    await fixture.componentInstance.ensureCandidates();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Favorite or open a text-based tool');
  });

  it('lists a recently-used text-eligible tool even when not favorited', async () => {
    TestBed.inject(UsageService).recordOpen('json');

    const fixture = TestBed.createComponent(QuickRunPanel);
    fixture.detectChanges();
    await fixture.componentInstance.ensureCandidates();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('JSON Formatter');
  });

  it('opens the full Quick Run route', async () => {
    const fixture = TestBed.createComponent(QuickRunPanel);
    fixture.detectChanges();
    await fixture.componentInstance.ensureCandidates();
    fixture.detectChanges();

    const viewAll = Array.from(fixture.nativeElement.querySelectorAll('button')).find(
      (b) => (b as HTMLButtonElement).textContent?.includes('Open Quick Run'),
    ) as HTMLButtonElement;
    viewAll.click();

    expect(TestBed.inject(Router).navigateByUrl).toHaveBeenCalledWith('/quick-run');
  });

  it('loads no tool code on mount, only after the first focus of the input', async () => {
    TestBed.inject(FavoritesService).toggleTool('base64');
    const spy = vi.spyOn(QuickRunPanel.prototype as unknown as { loadStep(id: string): Promise<unknown> }, 'loadStep');

    const fixture = TestBed.createComponent(QuickRunPanel);
    fixture.detectChanges();
    await fixture.whenStable();
    expect(spy).not.toHaveBeenCalled();
    expect(fixture.nativeElement.textContent).toContain('Paste or type to run it');

    spy.mockClear();
    fixture.nativeElement.querySelector('textarea').dispatchEvent(new Event('focus'));
    await fixture.whenStable();
    await fixture.componentInstance.ensureCandidates();
    fixture.detectChanges();

    expect(spy).toHaveBeenCalledWith('base64');
    expect(fixture.nativeElement.textContent).toContain('Base64 Encoder / Decoder');
    spy.mockRestore();
  });
});
