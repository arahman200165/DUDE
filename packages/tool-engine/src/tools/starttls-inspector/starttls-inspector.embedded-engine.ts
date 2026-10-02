import type { StartTlsView } from "@dude/contracts/core/platform/network-live-types";
export function StarttlsInspectorTool_view(result: unknown): StartTlsView | null { return result && 'transcript' in (result as object) ? result as StartTlsView : null; }
