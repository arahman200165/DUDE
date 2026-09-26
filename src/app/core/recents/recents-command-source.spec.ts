import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { RECENTS_COMMAND_SOURCE_PROVIDERS, RecentsCommandSource } from './recents-command-source';
import { UsageService } from '../usage/usage.service';
import { WorkspaceLayoutService } from '../workspace/workspace-layout.service';
import { routes } from '../routing/app.routes';

describe('RecentsCommandSource', () => {
  let source: RecentsCommandSource;
  let usage: UsageService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter(routes), ...RECENTS_COMMAND_SOURCE_PROVIDERS] });
    source = TestBed.inject(RecentsCommandSource);
    usage = TestBed.inject(UsageService);
    TestBed.inject(WorkspaceLayoutService); // avoid the "now" workspace-tab entries dominating the list
  });

  it('exposes a "Recent: X" command for a recently opened tool', () => {
    usage.recordOpen('base64');

    const command = source.commands().find((c) => c.id === 'recent:tool:base64');
    expect(command?.title).toBe('Recent: Base64 Encoder / Decoder');
    expect(command?.kind).toBe('recent');
  });

  it('opening a recent tool command navigates to it', async () => {
    usage.recordOpen('base64');
    const router = TestBed.inject(Router);
    const navigateSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    await source.commands().find((c) => c.id === 'recent:tool:base64')!.execute();

    expect(navigateSpy).toHaveBeenCalledWith('/tools/base64');
  });
});
