import type { SysPlanRequest } from '../../../shared-logic/system/sys-mutation-types';
import type { ServiceGraphNode } from '../../../shared-logic/system/service-graph';
import type { ServiceConfig, ServiceState, ServiceStartType, ServiceSummary } from '../../../shared-logic/system/system-types';
import type { TreeNode } from '../../shared/components/tree-view/tree-view';
import type { StatusGlyphKind } from '../../shared/components/status-glyph/status-glyph';

export const SERVICES_VIEWER_TOOL_ID = 'services-viewer';

export type ServiceActionKind = 'start' | 'stop' | 'restart';
export type SettableStartType = 'auto' | 'auto-delayed' | 'manual' | 'disabled';

export const START_TYPES: readonly { value: SettableStartType; label: string }[] = [
  { value: 'auto', label: 'Automatic' },
  { value: 'auto-delayed', label: 'Automatic (Delayed Start)' },
  { value: 'manual', label: 'Manual' },
  { value: 'disabled', label: 'Disabled' },
];

const START_LABELS: Record<ServiceStartType, string> = {
  boot: 'Boot', system: 'System', auto: 'Automatic', 'auto-delayed': 'Automatic (Delayed)', manual: 'Manual', disabled: 'Disabled',
};
export const startTypeLabel = (t: ServiceStartType): string => START_LABELS[t];

export const stateLabel = (s: ServiceState): string => s.replace('-', ' ');

export function stateGlyph(s: ServiceState): StatusGlyphKind {
  switch (s) {
    case 'running': return 'success';
    case 'stopped': return 'idle';
    case 'paused': return 'warning';
    default: return 'busy';
  }
}

const ACTION_TITLES: Record<ServiceActionKind, string> = { start: 'Start service', stop: 'Stop service', restart: 'Restart service' };

/** Which lifecycle actions make sense for a service in this state. */
export function availableActions(state: ServiceState): readonly ServiceActionKind[] {
  switch (state) {
    case 'stopped': return ['start'];
    case 'running': return ['stop', 'restart'];
    case 'paused': return ['stop', 'restart'];
    default: return [];
  }
}

export function serviceActionRequest(config: Pick<ServiceConfig, 'name' | 'displayName'>, action: ServiceActionKind): SysPlanRequest {
  return {
    tool: SERVICES_VIEWER_TOOL_ID,
    title: `${ACTION_TITLES[action]}: ${config.displayName || config.name}`,
    ops: [{ kind: `service.${action}`, params: { name: config.name, displayName: config.displayName } }],
  };
}

export function startTypeRequest(config: Pick<ServiceConfig, 'name' | 'displayName'>, startType: SettableStartType): SysPlanRequest {
  return {
    tool: SERVICES_VIEWER_TOOL_ID,
    title: `Set startup type to ${startTypeLabel(startType)}: ${config.displayName || config.name}`,
    ops: [{ kind: 'service.setStartType', params: { name: config.name, displayName: config.displayName, startType } }],
  };
}

export function filterServices(rows: readonly ServiceSummary[], query: string, state: ServiceState | 'all', hidden: ReadonlySet<string> = new Set()): readonly ServiceSummary[] {
  const q = query.trim().toLowerCase();
  return rows.filter((s) => {
    if (hidden.has(s.name.toLowerCase())) return false;
    if (state !== 'all' && s.state !== state) return false;
    return !q || s.name.toLowerCase().includes(q) || s.displayName.toLowerCase().includes(q) || String(s.pid) === q;
  });
}

/** Adapts a service-graph tree to the shared `app-tree-view` node shape. */
export function toTreeNode(node: ServiceGraphNode, prefix: string): TreeNode {
  const path = `${prefix}/${node.name}`;
  const note = node.cycle ? 'cycle' : node.missing ? 'not found' : node.state ? stateLabel(node.state) : '';
  return {
    label: node.displayName && node.displayName !== node.name ? `${node.name} (${node.displayName})` : node.name,
    path,
    valueLabel: note,
    type: node.cycle ? 'cycle' : node.missing ? 'missing' : 'service',
    children: node.children.length ? node.children.map((c) => toTreeNode(c, path)) : undefined,
  };
}
