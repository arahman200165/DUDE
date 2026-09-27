import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { DeepLinkService } from './deep-link.service';

/**
 * `/open-link?u=web%2Bdude%3A%2F%2Fopen%2Ftool%2Fjson`: the installed PWA's `protocol_handlers`
 * target (Phase 26 Item 9). Browsers only allow `web+`-prefixed custom schemes, so `web+dude://…`
 * is rewritten to `dude://…` and fed through the exact same strict parser and navigation as a
 * desktop deep link. `run` links still stop at their confirmation. This route never renders
 * anything itself.
 */
export const openLinkGuard: CanActivateFn = (route) => {
  const raw = route.queryParamMap.get('u') ?? '';
  const rewritten = raw.replace(/^web\+dude:/i, 'dude:');
  if (rewritten.startsWith('dude:')) inject(DeepLinkService).accept(rewritten);
  return inject(Router).createUrlTree(['/']);
};
