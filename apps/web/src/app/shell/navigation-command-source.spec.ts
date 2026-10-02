import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { routes } from '../core/routing/app.routes';
import { searchCommands } from '../core/registry/command-search';
import { NAVIGATION_COMMAND_SOURCE_PROVIDERS, NavigationCommandSource, SHELL_DESTINATIONS } from './navigation-command-source';
import { CORE_SETTINGS_SECTIONS, settingsSectionAvailability } from './settings/settings-sections';

describe('NavigationCommandSource', () => {
  let source: NavigationCommandSource;
  let navigate: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter(routes), ...NAVIGATION_COMMAND_SOURCE_PROVIDERS] });
    source = TestBed.inject(NavigationCommandSource);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => vi.restoreAllMocks());

  it('offers every shell destination, every core Settings section, and contributed sections', () => {
    const titles = source.commands().map((command) => command.title);
    expect(titles).toEqual(expect.arrayContaining(SHELL_DESTINATIONS.map((destination) => destination.title)));
    expect(titles).toEqual(expect.arrayContaining(CORE_SETTINGS_SECTIONS.filter((section) => settingsSectionAvailability(section.hosts, 'web-standalone') !== 'hidden').map((section) => `Settings: ${section.title}`)));
    expect(titles).not.toContain('Settings: Devices');
    expect(titles).toContain('Settings: Markdown Workspace — Collaboration relay');
    expect(source.commands().every((command) => command.kind === 'navigation')).toBe(true);
  });

  it('navigates to each destination route', async () => {
    const byId = (id: string) => source.commands().find((command) => command.id === id)!;
    await byId('navigation:workspace').execute();
    await byId('navigation:settings:hotkeys').execute();
    await byId('navigation:settings:tools:markdown-workspace').execute();

    expect(navigate.mock.calls.map((call: unknown[]) => call[0])).toEqual(['/workspace', '/settings/hotkeys', '/settings/tools/markdown-workspace']);
  });

  it('every destination route actually exists in the route table', () => {
    const paths = routes[0].children!.map((route) => route.path);
    for (const destination of SHELL_DESTINATIONS) {
      expect(paths, destination.url).toContain(destination.url.slice(1));
    }
  });

  it('typing a destination name ranks it first', () => {
    expect(searchCommands(source.commands(), 'settings')[0].title).toBe('Settings');
    expect(searchCommands(source.commands(), 'quick run')[0].title).toBe('Quick Run');
  });
});
