import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { RecentsTab } from './recents-tab';
import { UsageService } from '../../../core/usage/usage.service';
import { NativeRecentsService } from '../../../core/native-recents/native-recents.service';
import { DesktopOpenService } from '../../../core/platform/desktop-open.service';
import { TOOL_DEFINITIONS } from '../../../core/registry/tool-definitions';

class FakeRouter {
  url = '/';
  navigateByUrl = vi.fn();
  navigate = vi.fn();
}

describe('RecentsTab', () => {
  let router: FakeRouter;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    router = new FakeRouter();
    TestBed.configureTestingModule({ providers: [{ provide: Router, useValue: router }] });
  });

  it('shows an empty-state message with nothing recorded yet', () => {
    const fixture = TestBed.createComponent(RecentsTab);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Nothing recent yet');
  });

  it('shows a recorded tool open with its Tool kind label', () => {
    const toolId = TOOL_DEFINITIONS[0].id;
    TestBed.inject(UsageService).recordOpen(toolId);

    const fixture = TestBed.createComponent(RecentsTab);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain(TOOL_DEFINITIONS[0].title);
    expect(fixture.nativeElement.textContent).toContain('Tool');
  });

  it('opens a tool entry via the launcher, navigating to its route', () => {
    const toolId = TOOL_DEFINITIONS[0].id;
    TestBed.inject(UsageService).recordOpen(toolId);

    const fixture = TestBed.createComponent(RecentsTab);
    fixture.detectChanges();

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    button.click();

    expect(router.navigateByUrl).toHaveBeenCalledWith(TOOL_DEFINITIONS[0].route);
  });

  it('shows a native-file entry and reopens it through DesktopOpenService on click', () => {
    TestBed.inject(NativeRecentsService).record({ path: 'C:/notes.md', name: 'notes.md', extension: '.md', openedAt: '2026-01-01T00:00:00.000Z' });
    const reopenSpy = vi.spyOn(TestBed.inject(DesktopOpenService), 'reopen').mockResolvedValue({ ok: true });

    const fixture = TestBed.createComponent(RecentsTab);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('notes.md');
    expect(fixture.nativeElement.textContent).toContain('Native File');

    const button: HTMLButtonElement = fixture.nativeElement.querySelector('button');
    button.click();

    expect(reopenSpy).toHaveBeenCalledWith('C:/notes.md');
  });
});
