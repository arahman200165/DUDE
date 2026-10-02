import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { WORKSPACE_HOST_CONTEXT } from '../workspace/workspace-host-context';
import { ToolRegistryService } from './tool-registry.service';

/**
 * Resolves the tool a shared primitive is currently mounted inside, without that tool having to
 * pass its own id down — the same lookup `ToolShell.definition` uses: Workspace's explicit
 * `WORKSPACE_HOST_CONTEXT` (two tools can be mounted at once there) or, on a tool's own direct
 * route, the route-derived registry match. Must be called in an injection context.
 */
export function injectCurrentTool(): () => ToolDefinition | undefined {
  const hostContext = inject(WORKSPACE_HOST_CONTEXT);
  const registry = inject(ToolRegistryService);
  const router = inject(Router);
  return () => (hostContext ? registry.getById(hostContext.toolId) : registry.getByRoute(router.url));
}
