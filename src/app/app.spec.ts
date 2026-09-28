import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideServiceWorker } from '@angular/service-worker';
import { App } from './app';
import { routes } from './core/routing/app.routes';
import { TOOL_COMMAND_SOURCE_PROVIDERS } from './core/registry/tool-command-source';
import { WORKSPACE_COMMAND_SOURCE_PROVIDERS } from './core/workspace/workspace-command-source';
import { PROJECT_COMMAND_SOURCE_PROVIDERS } from './core/project/project-command-source';
import { PIPELINE_COMMAND_SOURCE_PROVIDERS } from './core/pipeline/pipeline-command-source';
import { NATIVE_COMMAND_SOURCE_PROVIDERS } from './core/platform/native-command-source';
import { RECENTS_COMMAND_SOURCE_PROVIDERS } from './core/recents/recents-command-source';
import { PREFERENCES_COMMAND_SOURCE_PROVIDERS } from './core/platform/preferences-command-source';
import { ToolRegistryService } from './core/registry/tool-registry.service';

describe('App', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideRouter(routes),
        provideServiceWorker('ngsw-worker.js', { enabled: false }),
        ...TOOL_COMMAND_SOURCE_PROVIDERS,
        ...WORKSPACE_COMMAND_SOURCE_PROVIDERS,
        ...PROJECT_COMMAND_SOURCE_PROVIDERS,
        ...PIPELINE_COMMAND_SOURCE_PROVIDERS,
        ...NATIVE_COMMAND_SOURCE_PROVIDERS,
        ...RECENTS_COMMAND_SOURCE_PROVIDERS,
        ...PREFERENCES_COMMAND_SOURCE_PROVIDERS,
      ],
    });
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders the deck at the root route', async () => {
    const harness = await RouterTestingHarness.create('/');
    const compiled = harness.routeNativeElement as HTMLElement;
    expect(compiled.querySelector('h1')?.textContent).toContain('Dashboard');
  });

  // Phase 30D's exit criteria: default Home no longer renders the complete registry as its
  // dominant content, and an explicit "Browse all tools" entry points into Browse Tools instead.
  it('bounds default Home instead of rendering the complete tool registry', async () => {
    const harness = await RouterTestingHarness.create('/');
    const compiled = harness.routeNativeElement as HTMLElement;
    const registrySize = TestBed.inject(ToolRegistryService).getAll().length;

    // A handful of representative tool links per category preview is fine; the full registry
    // (hundreds of tools) unconditionally rendered as links is exactly what Phase 30D removes.
    expect(compiled.querySelectorAll('a[href^="/tools/"]').length).toBeLessThan(registrySize / 2);
    const browseAllLinks = Array.from(compiled.querySelectorAll('a[href="/tools"]'));
    expect(browseAllLinks.some((link) => link.textContent?.includes('Browse all tools'))).toBe(true);
  });

  it('a worker failure on a real tool does not break shell navigation', async () => {
    const harness = await RouterTestingHarness.create('/tools/diff');
    const runButton = Array.from(harness.routeNativeElement!.querySelectorAll('button')).find(
      (button) => button.textContent?.trim() === 'Diff',
    ) as HTMLButtonElement;

    // jsdom has no Worker implementation, so this exercises the same
    // construction-failure path a real worker crash would take.
    expect(() => runButton.click()).not.toThrow();
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('Failed');

    await harness.navigateByUrl('/');
    harness.detectChanges();

    expect(harness.routeNativeElement?.textContent).toContain('Dashboard');
  });
});
