import type { PanelDefinition } from "@dude/domain/shared/models/panel-definition.model";
import { GRID_COLUMNS, GridItem, LimitsOf, deriveNarrow, firstFit } from "@dude/domain/core/home-layout/grid-engine";
import type { HomeLayout, PanelInstance } from "@dude/domain/core/home-layout/home-layout.model";
import { defaultConfig } from "@dude/domain/core/home-layout/panel-config";

export function limitsFromDefinitions(defs: readonly PanelDefinition[], instances: readonly PanelInstance[]): LimitsOf {
  const kindOf = new Map(instances.map((i) => [i.id, i.kindId]));
  const byKind = new Map(defs.map((d) => [d.id, d.size]));
  return (instanceId) => byKind.get(kindOf.get(instanceId) ?? '') ?? { minW: 2, minH: 1 };
}

/**
 * Assemble the shipped default layout from manifests alone: every kind with a `defaultPlacement`
 * becomes one visible instance (instance id = kind id), packed row-major in `order`. The narrow
 * layout is derived from the wide one. No panel id is named here.
 */
export function buildDefaultLayout(defs: readonly PanelDefinition[]): HomeLayout {
  const placeable = defs
    .filter((d) => d.defaultPlacement)
    .sort((a, b) => a.defaultPlacement!.order - b.defaultPlacement!.order || a.id.localeCompare(b.id));

  const instances: PanelInstance[] = placeable.map((d) => ({
    id: d.id,
    kindId: d.id,
    config: defaultConfig(d.config),
    visible: true,
  }));

  const wide: GridItem[] = [];
  for (const d of placeable) {
    const { w, h } = d.defaultPlacement!;
    // Row-major first-fit allows side-by-side pairs, but never starts above the previous item's row
    // so reading order matches the declared `order`.
    const lastY = wide.length > 0 ? wide[wide.length - 1].y : 0;
    wide.push({ id: d.id, ...firstFit(wide, { w, h }, GRID_COLUMNS, lastY) });
  }

  const narrow = deriveNarrow(wide, limitsFromDefinitions(defs, instances));
  return { instances, wide, narrow };
}
