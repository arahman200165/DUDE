import { Type, inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { ShareLinkService } from '../share/share-link.service';
import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { ToolLoadFailure } from '../../shared/components/tool-load-failure/tool-load-failure';
import { TOOL_DEFINITIONS } from './tool-definitions';

export function toRoutePath(route: string): string {
  return route.startsWith('/') ? route.slice(1) : route;
}

/**
 * Wraps a lazy route loader so a failed chunk load (offline before first visit, or a stale tab
 * after a deploy) resolves to the statically bundled `ToolLoadFailure` instead of failing the whole
 * navigation and leaving a blank app (DUDE_PRD.md §21 Phase 26 Items 10–11). Used for every tool
 * route and every lazy shell destination. The router caches whatever `loadComponent` resolves on
 * the Route, so recovery is a full reload, which the failure screen offers.
 */
export function withLoadFallback(label: string, loader: () => Promise<unknown>): () => Promise<Type<unknown>> {
  return () =>
    (loader() as Promise<Type<unknown>>).catch((error: unknown) => {
      console.warn(`[DUDE] Failed to load ${label}`, error);
      return ToolLoadFailure;
    });
}

export function loadToolComponent(definition: ToolDefinition): Promise<Type<unknown>> {
  return withLoadFallback(`tool "${definition.id}"`, definition.load)();
}

/**
 * Shareable Tool Routes receiver (Phase 26 Item 12). A `#in=v1.…` fragment is decoded into the
 * tool's input *before* the component constructs, so its normal construction-time storage read
 * picks it up. Then the guard redirects to the same URL minus the fragment, keeping the payload out
 * of the address bar and History. Any other fragment passes through untouched.
 */
export function shareLinkReceiver(toolId: string): CanActivateFn {
  return (route) => {
    const share = inject(ShareLinkService);
    const router = inject(Router);
    if (!share.carriesInput(route.fragment)) return true;
    return share
      .receive(toolId, route.fragment)
      .then((applied) =>
        applied ? router.createUrlTree(['/', ...route.url.map((segment) => segment.path)], { queryParams: route.queryParams }) : true,
      );
  };
}

export function buildToolRoutes(definitions: readonly ToolDefinition[] = TOOL_DEFINITIONS): Routes {
  return definitions.map((definition) => ({
    path: toRoutePath(definition.route),
    canActivate: [shareLinkReceiver(definition.id)],
    loadComponent: () => loadToolComponent(definition),
  }));
}
