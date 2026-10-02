import type { DnssecView } from "@dude/contracts/core/platform/network-live-types";
export function DnssecInspectorTool_view(result: unknown): DnssecView { return result as DnssecView; }
export function DnssecInspectorTool_statusClass(status: string): string {
    return status === 'secure' || status === 'anchor' ? 'text-success' : status === 'insecure' ? 'text-warning' : status === 'bogus' ? 'text-error' : 'text-text-muted';
}
