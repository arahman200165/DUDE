import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { PREFERENCES_COMMAND_SOURCE_PROVIDERS, PreferencesCommandSource } from './preferences-command-source';
import { WorkspaceLayoutService } from '../workspace/workspace-layout.service';
import { routes } from '../routing/app.routes';

describe('PreferencesCommandSource', () => {
  let source: PreferencesCommandSource;
  let workspaceLayout: WorkspaceLayoutService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    Object.defineProperty(window, 'dude', { value: undefined, configurable: true });
    TestBed.configureTestingModule({ providers: [provideRouter(routes), ...PREFERENCES_COMMAND_SOURCE_PROVIDERS] });
    source = TestBed.inject(PreferencesCommandSource);
    workspaceLayout = TestBed.inject(WorkspaceLayoutService);
  });

  it('omits desktop-only commands on web', () => {
    expect(source.commands().some((c) => c.id === 'preference:toggle-launch-on-login')).toBe(false);
    expect(source.commands().some((c) => c.id === 'preference:open-settings')).toBe(true);
  });

  it('the reopen-on-restart toggle command flips the live preference and relabels itself', async () => {
    workspaceLayout.reopenOnRestart.set(true);
    let command = source.commands().find((c) => c.id === 'preference:toggle-reopen-on-restart')!;
    expect(command.title).toBe('Turn Off: Reopen Tabs on Restart');

    await command.execute();

    expect(workspaceLayout.reopenOnRestart()).toBe(false);
    command = source.commands().find((c) => c.id === 'preference:toggle-reopen-on-restart')!;
    expect(command.title).toBe('Turn On: Reopen Tabs on Restart');
  });
});
