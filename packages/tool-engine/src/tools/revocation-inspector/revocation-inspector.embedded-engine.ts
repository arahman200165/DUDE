import type { RevocationView } from "@dude/contracts/core/platform/network-live-types";
export function RevocationInspectorTool_view(result: unknown): RevocationView | null { return result && (result as RevocationView).urls ? result as RevocationView : null; }
export function RevocationInspectorTool_statusClass(status?: string): string { return status === 'good' ? 'text-success' : status === 'revoked' ? 'text-error' : 'text-warning'; }
