import { InjectionToken } from '@angular/core';

/**
 * Provided by `ToolHost` into the child injector of a dynamically-mounted tool component, so that
 * component's `ToolShell` knows which tool it's hosting without a route to read
 * (`ToolRegistryService.getByRoute(router.url)` breaks the moment two tools are mounted at once —
 * see `shared/components/tool-shell/tool-shell.ts`). Defaults to `null` via the factory, so a tool
 * reached the normal way (its own direct route) sees no provider and falls back to the existing
 * route-derived lookup unchanged.
 */
export interface WorkspaceHostContext {
  readonly toolId: string;
}

export const WORKSPACE_HOST_CONTEXT = new InjectionToken<WorkspaceHostContext | null>('WORKSPACE_HOST_CONTEXT', {
  factory: () => null,
});
