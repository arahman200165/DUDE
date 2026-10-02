/**
 * Pure, framework-free ranking function over `PASTE_DETECTORS`. Kept separate from the registry
 * itself so it can be unit-tested with a fake detector list, independent of the curated real one.
 */
import type { ToolMetadata as ToolDefinition } from "@dude/domain/shared/models/tool-metadata.model";
import { PasteDetectionMatch, PasteDetector } from "@dude/domain/shared/models/paste-detector.model";

const MAX_MATCHES = 4;

export function detectShapes(
  text: string,
  detectors: readonly PasteDetector[],
  getTool: (toolId: string) => ToolDefinition | undefined,
): readonly PasteDetectionMatch[] {
  if (text.trim() === '') return [];

  const matches: PasteDetectionMatch[] = [];
  for (const detector of detectors) {
    const score = detector.test(text);
    if (score === null) continue;

    const tool = getTool(detector.toolId);
    if (!tool) continue;

    matches.push({ toolId: detector.toolId, title: tool.shortTitle ?? tool.title, score });
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, MAX_MATCHES);
}
