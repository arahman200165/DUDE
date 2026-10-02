import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { computeCharDiff, computeWordDiff } from "@dude/tool-engine/tools/advanced-diff/char-word-diff";
import { AdvancedDiffPayload, DiffMode } from "@dude/tool-engine/tools/advanced-diff/advanced-diff-payload";
import { AdvancedDiffResult, SemanticDiffOutcome } from "@dude/tool-engine/tools/advanced-diff/advanced-diff-result";
import { computeThreeWayMerge } from "@dude/tool-engine/tools/advanced-diff/three-way-merge";
import { computeLineDiffIgnoring, hasAnyIgnoreOption, normalizeWholeText } from "@dude/tool-engine/tools/advanced-diff/diff-normalize";
import { diffTrees, parseSemanticInput, SemanticFormat } from "@dude/tool-engine/tools/advanced-diff/object-tree-diff";

const SEMANTIC_FORMAT_BY_MODE: Partial<Record<DiffMode, SemanticFormat>> = {
  'semantic-json': 'json',
  'semantic-yaml': 'yaml',
  'semantic-xml': 'xml',
};

function computeSemanticDiff(payload: AdvancedDiffPayload): SemanticDiffOutcome | undefined {
  const format = SEMANTIC_FORMAT_BY_MODE[payload.mode];
  if (!format) return undefined;

  const before = parseSemanticInput(payload.left, format);
  if (!before.ok) return { ok: false, error: `Left input is not valid ${format.toUpperCase()}: ${before.error.message}` };

  const after = parseSemanticInput(payload.right, format);
  if (!after.ok) return { ok: false, error: `Right input is not valid ${format.toUpperCase()}: ${after.error.message}` };

  return { ok: true, result: diffTrees(before.value, after.value, { ignoreCase: payload.ignoreOptions.ignoreCase }) };
}

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<AdvancedDiffPayload>>): void {
  const { id, payload } = data;

  try {
    const lineDiff = computeLineDiffIgnoring(payload.left, payload.right, payload.ignoreOptions);

    // Fine (char/word) diffing has no line-alignment invariant to remap through, so when ignore-options
    // are active it diffs the normalized text directly -- a documented display-only limitation.
    const ignoring = hasAnyIgnoreOption(payload.ignoreOptions);
    const fineLeft = ignoring ? normalizeWholeText(payload.left, payload.ignoreOptions) : payload.left;
    const fineRight = ignoring ? normalizeWholeText(payload.right, payload.ignoreOptions) : payload.right;
    const fineDiff =
      payload.granularity === 'char'
        ? computeCharDiff(fineLeft, fineRight)
        : payload.granularity === 'word'
          ? computeWordDiff(fineLeft, fineRight)
          : undefined;
    const threeWayMerge =
      payload.base !== undefined
        ? computeThreeWayMerge(payload.base, payload.left, payload.right, payload.ignoreOptions)
        : undefined;
    const semanticDiff = computeSemanticDiff(payload);

    const result: AdvancedDiffResult = { lineDiff, fineDiff, semanticDiff, threeWayMerge };
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
