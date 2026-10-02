import type { PanelNode } from '@dude/domain/core/workspace/workspace.model';

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

export const isNonEmptyString = (value: unknown): value is string => typeof value === 'string' && value.length > 0;

export const stringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

/** Spread helper: `{}` when the value is not a string, so absent optionals never become explicit `undefined`. */
export const optionalString = <K extends string>(key: K, value: unknown): { [P in K]?: string } =>
  typeof value === 'string' ? ({ [key]: value } as { [P in K]?: string }) : {};

const MAX_PANEL_DEPTH = 32;

/** Structural validation of a panel tree; any malformed node makes the whole tree `null`. */
export function sanitizePanelTree(raw: unknown, depth = 0): PanelNode | null {
  if (!isRecord(raw) || depth > MAX_PANEL_DEPTH || !isNonEmptyString(raw['nodeId'])) return null;
  if (raw['kind'] === 'leaf') {
    return isNonEmptyString(raw['toolId']) ? { kind: 'leaf', nodeId: raw['nodeId'], toolId: raw['toolId'] } : null;
  }
  if (raw['kind'] === 'split') {
    const ratio = raw['ratio'];
    if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return null;
    const a = sanitizePanelTree(raw['a'], depth + 1);
    const b = sanitizePanelTree(raw['b'], depth + 1);
    return a && b ? { kind: 'split', nodeId: raw['nodeId'], ratio, a, b } : null;
  }
  return null;
}
