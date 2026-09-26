import { ToolDefinition } from '../../shared/models/tool-definition.model';
import { identifyZipContainer, sniffFileType } from '../../shared/utils/file-signatures';
import { FileDropContext, FileDropDetector, FileDropMatch } from './file-drop-detectors.model';

const MAX_MATCHES = 6;
/** Enough leading bytes for every signature in file-signatures.ts (the longest check is 8 bytes)
 *  plus headroom for identifyZipContainer's internal-filename scan. */
const SNIFF_PREFIX_BYTES = 4096;
/** Extension-only match against a tool's registered `desktopOpen.extensions` -- below any
 *  magic-byte-verified match, above the universal file-hash/file-base64 fallbacks. */
const EXTENSION_MATCH_SCORE = 0.85;

function declaredExtensionOf(fileName: string): string | null {
  const dot = fileName.lastIndexOf('.');
  if (dot < 0 || dot === fileName.length - 1) return null;
  return fileName.slice(dot).toLowerCase();
}

function upsertBestScore(
  matches: Map<string, FileDropMatch>,
  tool: ToolDefinition,
  score: number,
  reason: string,
): void {
  const existing = matches.get(tool.id);
  if (existing && existing.score >= score) return;
  matches.set(tool.id, { toolId: tool.id, title: tool.shortTitle ?? tool.title, score, reason });
}

/**
 * Pure ranking over three signals — magic-byte/format detectors (`FILE_DROP_DETECTORS`), and a
 * registry-driven extension match against every tool's own `desktopOpen.extensions` (already used,
 * unmodified, by the deterministic single-match OS-file-association flow — see `AGENTS.md`).
 * Kept separate from byte-reading so it's trivially testable with synthetic contexts.
 */
export function rankFileDropCandidates(
  context: FileDropContext,
  definitions: readonly ToolDefinition[],
  detectors: readonly FileDropDetector[],
  getTool: (toolId: string) => ToolDefinition | undefined,
): readonly FileDropMatch[] {
  const matches = new Map<string, FileDropMatch>();

  for (const detector of detectors) {
    const score = detector.test(context);
    if (score === null) continue;
    const tool = getTool(detector.toolId);
    if (tool) upsertBestScore(matches, tool, score, context.sniffed ? `Detected: ${context.sniffed.mime}` : 'File signature match');
  }

  const extension = declaredExtensionOf(context.fileName);
  if (extension) {
    for (const tool of definitions) {
      if (tool.desktopOpen?.extensions?.includes(extension)) {
        upsertBestScore(matches, tool, EXTENSION_MATCH_SCORE, `${extension} file`);
      }
    }
  }

  return [...matches.values()].sort((a, b) => b.score - a.score).slice(0, MAX_MATCHES);
}

/** Builds a `FileDropContext` from a real `File`, reading only its leading bytes. */
export async function buildFileDropContext(file: File): Promise<FileDropContext> {
  const prefix = new Uint8Array(await file.slice(0, SNIFF_PREFIX_BYTES).arrayBuffer());
  const sniffed = sniffFileType(prefix);
  const containerFormat = sniffed?.mime === 'application/zip' ? identifyZipContainer(prefix) : null;
  return { fileName: file.name, declaredMime: file.type, sniffed, containerFormat };
}

/** End-to-end: reads `file`'s header bytes and ranks candidate tools against the real registry. */
export async function detectFileDrop(
  file: File,
  definitions: readonly ToolDefinition[],
  detectors: readonly FileDropDetector[],
  getTool: (toolId: string) => ToolDefinition | undefined,
): Promise<readonly FileDropMatch[]> {
  const context = await buildFileDropContext(file);
  return rankFileDropCandidates(context, definitions, detectors, getTool);
}
