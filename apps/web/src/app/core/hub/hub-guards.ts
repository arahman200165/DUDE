import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { PlatformService } from '../platform/platform.service';
import { HUB_ADMIN } from './hub-admin.token';
import { HubAdminError } from './hub-admin.port';

/** Matches only in the Hub-served web build: the desktop and Pages builds expose no `/hub/*` routes at all. */
export const hubWebOnlyMatch: CanMatchFn = () => inject(PlatformService).hostKind === 'hub-web';

/**
 * Entry guard of the Hub-served web build's shell. A Hub that has no owner yet sends the visitor to `/hub/setup`,
 * a missing or expired session to `/hub/sign-in`. It is a UX redirect, not the security boundary: the Hub
 * authorizes every API call itself. Other hosts pass straight through, as do the `/hub/*` pages.
 */
export const hubSessionGuard: CanActivateFn = async (_route, state) => {
  if (inject(PlatformService).hostKind !== 'hub-web' || state.url.startsWith('/hub/')) return true;
  const admin = inject(HUB_ADMIN);
  const router = inject(Router);
  try {
    const probe = await admin.probeLocal();
    if (probe.bootstrapped === false) return router.parseUrl('/hub/setup');
  } catch {
    // An unreachable Hub is reported by the pages that need it; the session check below decides the redirect.
  }
  try {
    await admin.currentSession();
    return true;
  } catch (error) {
    if (error instanceof HubAdminError && error.code === 'unauthorized') {
      return router.createUrlTree(['/hub/sign-in'], state.url === '/' ? {} : { queryParams: { returnUrl: state.url } });
    }
    return true;
  }
};
