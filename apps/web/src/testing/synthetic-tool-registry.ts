import { Component } from '@angular/core';
import type { Provider } from '@angular/core';
import { TOOL_CATEGORIES } from "@dude/shared-types/shared/models/tool-category.model";
import type { ToolDefinition } from '../app/shared/models/tool-definition.model';
import { TOOL_DEFINITION_SOURCE } from '../app/core/registry/tool-registry.service';

/**
 * Test-only synthetic manifest generator (DUDE_PRD.md Phase 30L.6). Never imported from app code,
 * so it is never bundled or shipped as fake tools.
 */
@Component({ selector: 'app-synthetic-stub', template: '' })
export class SyntheticStubComponent {}

/** Titles that are always present (at fixed indexes) so specs can search for a known tool. */
export const SYNTHETIC_KNOWN_TITLES = ['Zephyr Quartz Converter', 'Obsidian Lattice Inspector', 'Marigold Vector Planner'] as const;
const KNOWN_INDEXES = [7, 42, 133] as const;

export function syntheticToolId(index: number): string {
  return `synthetic-tool-${String(index).padStart(4, '0')}`;
}

/** Deterministic: same `count` always yields the same registry, spread round-robin across all categories. */
export function syntheticToolDefinitions(count: number): ToolDefinition[] {
  return Array.from({ length: count }, (_, i) => {
    const id = syntheticToolId(i);
    const known = KNOWN_INDEXES.indexOf(i as (typeof KNOWN_INDEXES)[number]);
    const title = known >= 0 && i < count ? SYNTHETIC_KNOWN_TITLES[known] : `Synthetic Tool ${String(i).padStart(4, '0')}`;
    return {
      id,
      title,
      description: `A synthetic fixture tool (${i}) for scale testing.`,
      category: TOOL_CATEGORIES[i % TOOL_CATEGORIES.length],
      keywords: ['synthetic', `bucket-${i % 10}`],
      route: `/tools/${id}`,
      load: () => Promise.resolve(SyntheticStubComponent),
      io: { accepts: ['text'], produces: ['text'] },
      status: i % 3 === 0 ? 'verified' : undefined,
    } satisfies ToolDefinition;
  });
}

export function provideSyntheticToolRegistry(count: number): Provider[] {
  return [{ provide: TOOL_DEFINITION_SOURCE, useValue: syntheticToolDefinitions(count) }];
}
