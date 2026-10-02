import { PANEL_DATA_SOURCES, PanelDefinition } from "@dude/domain/shared/models/panel-definition.model";
import { GRID_COLUMNS } from "@dude/domain/core/home-layout/grid-engine";

const KIND_ID = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;

/** Structural checks shared by the conformance spec and the dev-mode registry sanity pass. */
export function validatePanelDefinitions(defs: readonly PanelDefinition[]): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  const replaced = new Set<string>();

  for (const d of defs) {
    const at = `panel "${d.id}"`;
    if (!KIND_ID.test(d.id)) problems.push(`${at}: id must be kebab-case`);
    if (seen.has(d.id)) problems.push(`${at}: duplicate id`);
    seen.add(d.id);
    if (!d.title.trim()) problems.push(`${at}: missing title`);
    if (!d.description.trim()) problems.push(`${at}: missing description`);
    if (typeof d.load !== 'function') problems.push(`${at}: load must be a function`);

    const { minW, minH, maxW, maxH } = d.size;
    if (!Number.isInteger(minW) || !Number.isInteger(minH) || minW < 1 || minH < 1) problems.push(`${at}: min size must be whole cells >= 1`);
    if (minW > GRID_COLUMNS) problems.push(`${at}: minW exceeds ${GRID_COLUMNS} columns`);
    if (maxW !== undefined && (maxW < minW || maxW > GRID_COLUMNS)) problems.push(`${at}: maxW must be within [minW, ${GRID_COLUMNS}]`);
    if (maxH !== undefined && maxH < minH) problems.push(`${at}: maxH must be >= minH`);

    const p = d.defaultPlacement;
    if (p) {
      if (!Number.isInteger(p.order)) problems.push(`${at}: defaultPlacement.order must be an integer`);
      if (p.w < minW || p.h < minH || (maxW !== undefined && p.w > maxW) || (maxH !== undefined && p.h > maxH) || p.w > GRID_COLUMNS) {
        problems.push(`${at}: defaultPlacement violates size limits`);
      }
    }

    const keys = new Set<string>();
    for (const f of d.config ?? []) {
      if (keys.has(f.key)) problems.push(`${at}: duplicate config key "${f.key}"`);
      keys.add(f.key);
      if (f.type === 'number' && (f.min > f.max || f.default < f.min || f.default > f.max)) problems.push(`${at}: config "${f.key}" default out of range`);
      if (f.type === 'select' && !f.options.some((o) => o.value === f.default)) problems.push(`${at}: config "${f.key}" default not in options`);
    }
    // Multi-instance kinds must be distinguishable by something.
    if (d.multiInstance && (d.config?.length ?? 0) === 0 && d.userContent === undefined) {
      problems.push(`${at}: multiInstance needs config or userContent so duplicates are distinct`);
    }

    for (const src of d.dataDependencies) {
      if (!(PANEL_DATA_SOURCES as readonly string[]).includes(src)) problems.push(`${at}: unknown data dependency "${src}"`);
    }
    if (d.userContent !== undefined && !d.dataDependencies.includes('user-content')) {
      problems.push(`${at}: user-authored kinds must declare the "user-content" dependency`);
    }
    for (const c of d.capabilities ?? []) {
      if (!c.note.trim()) problems.push(`${at}: capability "${c.id}" needs a note`);
    }
    if (d.webBehavior === 'explain' && !d.desktopOnly && !(d.capabilities ?? []).some((c) => c.web === 'unavailable')) {
      problems.push(`${at}: webBehavior "explain" requires desktopOnly or a web-unavailable capability`);
    }
    for (const old of d.replaces ?? []) {
      if (replaced.has(old)) problems.push(`${at}: "${old}" is replaced by more than one kind`);
      replaced.add(old);
    }
  }
  for (const old of replaced) if (seen.has(old)) problems.push(`replaced kind id "${old}" is still registered`);
  return problems;
}
