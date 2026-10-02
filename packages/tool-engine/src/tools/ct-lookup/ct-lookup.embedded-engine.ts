import type { CtView } from "@dude/contracts/core/platform/network-live-types";
export function CtLookupTool_view(result: unknown): CtView | null { return result && (result as CtView).scts ? result as CtView : null; }
