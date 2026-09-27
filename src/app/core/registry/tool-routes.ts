import { Type } from '@angular/core';
import { Routes } from '@angular/router';
import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { ToolLoadFailure } from '../../shared/components/tool-load-failure/tool-load-failure';
import { TOOL_DEFINITIONS } from './tool-definitions';

export function toRoutePath(route: string): string {
  return route.startsWith('/') ? route.slice(1) : route;
}

/**
 * A failed lazy load (offline before first visit, or a stale tab after a deploy) resolves to the
 * statically bundled `ToolLoadFailure` instead of leaving a blank route (DUDE_PRD.md §21 Phase 26
 * Item 10). The router caches whatever `loadComponent` resolves on the Route, so recovery is a full
 * reload, which the failure screen offers.
 */
export function loadToolComponent(definition: ToolDefinition): Promise<Type<unknown>> {
  return (definition.load() as Promise<Type<unknown>>).catch((error: unknown) => {
    console.warn(`[DUDE] Failed to load tool "${definition.id}"`, error);
    return ToolLoadFailure;
  });
}

export function buildToolRoutes(definitions: readonly ToolDefinition[] = TOOL_DEFINITIONS): Routes {
  return definitions.map((definition) => ({
    path: toRoutePath(definition.route),
    loadComponent: () => loadToolComponent(definition),
  }));
}
