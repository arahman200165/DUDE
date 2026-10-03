import { InjectionToken, inject } from '@angular/core';
import { NavigationExtras, Router } from '@angular/router';

/**
 * Leaves a Hub page (sign-in, setup, recover) for the app once the owner has a session. A client-side navigation is
 * enough in tests and stand-alone use; the Hub-served build replaces it with a full page load (`hubWebProviders`), so the
 * boot code in `main.ts` runs again signed in: it attaches the browser, reads the snapshot and installs the Hub backend.
 */
export type HubAppEntry = (target: string | readonly string[], extras?: NavigationExtras) => Promise<unknown>;

export const HUB_APP_ENTRY = new InjectionToken<HubAppEntry>('DUDE Hub app entry', {
  providedIn: 'root',
  factory: () => {
    const router = inject(Router);
    return (target, extras) => {
      if (typeof target === 'string') return extras ? router.navigateByUrl(target, extras) : router.navigateByUrl(target);
      return router.navigate([...target], extras);
    };
  },
});

/** Full page load of an app URL, honoring the document's base href. */
export function hardNavigate(url: string): Promise<never> {
  window.location.assign(new URL(url.replace(/^\//, ''), document.baseURI).href);
  // The page is going away; never resolve so callers do not run follow-up code against a dying app.
  return new Promise<never>(() => undefined);
}

export function hardNavigateEntry(): HubAppEntry {
  const router = inject(Router);
  return (target, extras) => hardNavigate(typeof target === 'string' ? target : router.serializeUrl(router.createUrlTree([...target], extras)));
}
