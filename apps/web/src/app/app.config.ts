import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './core/routing/app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { isElectronRuntime } from './core/platform/platform.service';
import { BUILD_HOST } from './core/platform/host-flag';
import { TOOL_COMMAND_SOURCE_PROVIDERS } from './core/registry/tool-command-source';
import { WORKSPACE_COMMAND_SOURCE_PROVIDERS } from './core/workspace/workspace-command-source';
import { PROJECT_COMMAND_SOURCE_PROVIDERS } from './core/project/project-command-source';
import { PIPELINE_COMMAND_SOURCE_PROVIDERS } from './core/pipeline/pipeline-command-source';
import { NATIVE_COMMAND_SOURCE_PROVIDERS } from './core/platform/native-command-source';
import { RECENTS_COMMAND_SOURCE_PROVIDERS } from './core/recents/recents-command-source';
import { PREFERENCES_COMMAND_SOURCE_PROVIDERS } from './core/platform/preferences-command-source';
import { SHARE_COMMAND_SOURCE_PROVIDERS } from './core/share/share-command-source';
import { DESKTOP_HANDOFF_COMMAND_SOURCE_PROVIDERS } from './core/deep-link/desktop-handoff-command-source';
import { AppearanceService } from './core/appearance/appearance.service';
import { NAVIGATION_COMMAND_SOURCE_PROVIDERS } from './shell/navigation-command-source';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Applies the saved theme/density/fonts to <html> at bootstrap (index.html pre-paints the attributes).
    provideAppInitializer(() => {
      inject(AppearanceService);
    }),
    ...TOOL_COMMAND_SOURCE_PROVIDERS,
    ...NAVIGATION_COMMAND_SOURCE_PROVIDERS,
    ...WORKSPACE_COMMAND_SOURCE_PROVIDERS,
    ...PROJECT_COMMAND_SOURCE_PROVIDERS,
    ...PIPELINE_COMMAND_SOURCE_PROVIDERS,
    ...NATIVE_COMMAND_SOURCE_PROVIDERS,
    ...RECENTS_COMMAND_SOURCE_PROVIDERS,
    ...PREFERENCES_COMMAND_SOURCE_PROVIDERS,
    ...SHARE_COMMAND_SOURCE_PROVIDERS,
    ...DESKTOP_HANDOFF_COMMAND_SOURCE_PROVIDERS,
    provideRouter(routes),
    provideServiceWorker('ngsw-worker.js', {
      // The Hub-served build ships no service worker (Hub web caching is its own milestone).
      enabled: !isDevMode() && !isElectronRuntime() && BUILD_HOST === 'web',
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
