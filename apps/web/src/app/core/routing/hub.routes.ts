import { Routes } from '@angular/router';
import { hubWebOnlyMatch } from '../hub/hub-guards';
import { withLoadFallback } from '../registry/tool-routes';

// The Hub-served web build (hostKind 'hub-web') also owns /hub/setup, /hub/sign-in and /hub/recover: Hub
// environment-administration entry points (shell exception #12). `hubWebOnlyMatch` keeps them out of the
// Pages and desktop builds, and `hubSessionGuard` sends an unauthenticated Hub visitor to them.
export const hubRoutes: Routes = [
  {
    path: 'hub',
    canMatch: [hubWebOnlyMatch],
    children: [
      { path: 'setup', loadComponent: withLoadFallback('HubSetupPage', () => import('../../shell/hub/hub-pages').then((m) => m.HubSetupPage)) },
      { path: 'sign-in', loadComponent: withLoadFallback('HubSignInPage', () => import('../../shell/hub/hub-pages').then((m) => m.HubSignInPage)) },
      { path: 'recover', loadComponent: withLoadFallback('HubRecoverPage', () => import('../../shell/hub/hub-pages').then((m) => m.HubRecoverPage)) },
    ],
  },
];
