import type { HttpsAnalysisView } from "@dude/contracts/core/platform/network-live-types";
export function HttpsConfigAnalyzerTool_view(result: unknown): HttpsAnalysisView | null { return result && (result as HttpsAnalysisView).findings ? result as HttpsAnalysisView : null; }
