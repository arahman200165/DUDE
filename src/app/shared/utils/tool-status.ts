import { ToolDefinition } from '../models/tool-definition.model';
import type { StatusGlyphKind } from '../components/status-glyph/status-glyph';
import { PLATFORM_CAPABILITIES, RUNTIMES, platformCapabilities, runtimeCapabilities } from '../../core/platform/capability-catalog';

/**
 * Shared display helpers for a tool's `status`/`capabilities` fields, used by both Browse Tools view
 * modes (`tool-table`, `tool-grid`) so their status chip and capability summary stay identical rather
 * than drifting between two hand-copied implementations.
 */

/** A tool with no declared `status` is its own explicit bucket, never silently shown as `stable`. */
export function toolStatusLabel(status: ToolDefinition['status']): string {
  return status ?? 'unstated';
}

export function toolStatusClass(status: ToolDefinition['status']): string {
  switch (status) {
    case 'verified':
      return 'border-accent/40 bg-accent/10 text-accent';
    case 'stable':
      return 'border-border text-text-muted';
    case 'experimental':
      return 'border-warning/40 bg-warning/10 text-warning';
    default:
      return 'border-dashed border-border text-text-muted';
  }
}

/** The always-on, non-color glyph shown beside a status label (verified check, experimental triangle, stable dot, unstated ring). */
export function toolStatusGlyph(status: ToolDefinition['status']): StatusGlyphKind {
  switch (status) {
    case 'verified':
      return 'success';
    case 'stable':
      return 'neutral';
    case 'experimental':
      return 'warning';
    default:
      return 'idle';
  }
}

/** Joined, user-facing labels for a tool's declared platform/runtime capabilities, or an em dash. */
export function toolCapabilitySummary(tool: ToolDefinition): string {
  const labels = [
    ...platformCapabilities(tool.capabilities).map((c) => PLATFORM_CAPABILITIES[c.id].label),
    ...runtimeCapabilities(tool.capabilities).map((r) => RUNTIMES[r].label),
  ];
  return labels.length ? labels.join(', ') : '—';
}
