import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { computeJsonDiff } from "@dude/tool-engine/tools/json/json-diff";
import { JsonDiffPayload } from "@dude/tool-engine/tools/json/json-diff-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<JsonDiffPayload>>): void {
  const { id, payload } = data;

  try {
    const result = computeJsonDiff(payload.left, payload.right);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
