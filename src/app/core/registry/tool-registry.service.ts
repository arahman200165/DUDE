import { inject, Injectable, InjectionToken, isDevMode } from '@angular/core';
import { ToolCategory, TOOL_CATEGORIES } from '../../shared/models/tool-category.model';
import { ToolDefinition, ToolSettingsSection } from '../../shared/models/tool-definition.model';
import { TOOL_DEFINITIONS } from './tool-definitions';
import { searchTools } from './tool-search';
import { platformCapabilities, runtimeCapabilities } from '../platform/capability-catalog';
import { PlatformToolCapability, RuntimeId } from '../../shared/models/tool-capability.model';
import { toRoutePath } from './tool-routes';

/** A tool-contributed Settings section, flattened with its owning tool's id/title. */
export interface ContributedSettingsSection extends ToolSettingsSection {
  readonly toolId: string;
  readonly toolTitle: string;
}

export function validateDefinitions(definitions: readonly ToolDefinition[]): void {
  const seenIds = new Set<string>();
  const seenRoutes = new Set<string>();

  for (const definition of definitions) {
    if (seenIds.has(definition.id)) {
      console.error(`Duplicate tool id "${definition.id}" found in TOOL_DEFINITIONS`);
    }
    seenIds.add(definition.id);

    const routePath = toRoutePath(definition.route);
    if (seenRoutes.has(routePath)) {
      console.error(`Duplicate tool route "${definition.route}" found in TOOL_DEFINITIONS`);
    }
    seenRoutes.add(routePath);
  }
}

/**
 * Where `ToolRegistryService` reads its manifests from. Production always uses the generated
 * `TOOL_DEFINITIONS`; specs override it (e.g. with a large synthetic registry) to prove the shell
 * does not treat today's tool count as a ceiling.
 */
export const TOOL_DEFINITION_SOURCE = new InjectionToken<readonly ToolDefinition[]>('TOOL_DEFINITION_SOURCE', {
  providedIn: 'root',
  factory: () => TOOL_DEFINITIONS,
});

@Injectable({ providedIn: 'root' })
export class ToolRegistryService {
  private readonly definitions: readonly ToolDefinition[] = inject(TOOL_DEFINITION_SOURCE);

  constructor() {
    if (isDevMode()) {
      validateDefinitions(this.definitions);
    }
  }

  getAll(): readonly ToolDefinition[] {
    return this.definitions;
  }

  getById(id: string): ToolDefinition | undefined {
    return this.definitions.find((definition) => definition.id === id);
  }

  /** Accepts a full router URL: any `?query` or `#fragment` is ignored. */
  getByRoute(route: string): ToolDefinition | undefined {
    const routePath = toRoutePath(route.split(/[?#]/)[0]);
    return this.definitions.find((definition) => toRoutePath(definition.route) === routePath);
  }

  getByCategory(category: ToolCategory): ToolDefinition[] {
    return this.definitions.filter((definition) => definition.category === category);
  }

  groupedByCategory(): Record<ToolCategory, ToolDefinition[]> {
    const grouped = Object.fromEntries(
      TOOL_CATEGORIES.map((category) => [category, [] as ToolDefinition[]]),
    ) as Record<ToolCategory, ToolDefinition[]>;

    for (const definition of this.definitions) {
      grouped[definition.category].push(definition);
    }

    return grouped;
  }

  search(query: string): ToolDefinition[] {
    return searchTools(this.definitions, query);
  }

  /** Every `settingsSection` declared by a manifest, alphabetical by tool title (Settings' "Tools" group). */
  settingsSections(): readonly ContributedSettingsSection[] {
    return this.definitions
      .filter((definition) => definition.settingsSection !== undefined)
      .map((definition) => ({ ...definition.settingsSection!, toolId: definition.id, toolTitle: definition.shortTitle ?? definition.title }))
      .sort((a, b) => a.toolTitle.localeCompare(b.toolTitle));
  }

  requiresNetwork(id: string): boolean {
    return this.getById(id)?.network?.required ?? false;
  }

  /** Declared native platform capabilities (Web Capability Matrix, Phase 26 Item 6). */
  platformCapabilitiesOf(id: string): readonly PlatformToolCapability[] {
    return platformCapabilities(this.getById(id)?.capabilities);
  }

  /** True when some declared feature of this tool is absent on the web companion. */
  hasWebUnavailableFeature(id: string): boolean {
    return this.platformCapabilitiesOf(id).some((capability) => capability.web === 'unavailable');
  }

  /** Optional runtime payloads (WASM/vendor) this tool needs before it can run offline. */
  runtimesOf(id: string): readonly RuntimeId[] {
    return runtimeCapabilities(this.getById(id)?.capabilities);
  }
}
