import { ApplicationConfig, provideBrowserGlobalErrorListeners, isDevMode } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './core/routing/app.routes';
import { provideServiceWorker } from '@angular/service-worker';
import { isElectronRuntime } from './core/platform/platform.service';
import { TOOL_COMMAND_SOURCE_PROVIDERS } from './core/registry/tool-command-source';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    ...TOOL_COMMAND_SOURCE_PROVIDERS,
    provideRouter(routes),
    provideServiceWorker('ngsw-worker.js', {
      enabled: !isDevMode() && !isElectronRuntime(),
      registrationStrategy: 'registerWhenStable:30000',
    }),
  ],
};
