import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { computeLineDiff } from "@dude/tool-engine/tools/diff/text-diff";
import { TextDiffPayload } from "@dude/tool-engine/tools/diff/text-diff-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<TextDiffPayload>>): void {
  const { id, payload } = data;

  try {
    const result = computeLineDiff(payload.left, payload.right);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
