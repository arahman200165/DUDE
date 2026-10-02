import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { mergeJson } from "@dude/tool-engine/tools/json-merge/json-merge-transform";
import { JsonMergePayload } from "@dude/tool-engine/tools/json-merge/json-merge-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<JsonMergePayload>>): void {
  const { id, payload } = data;

  try {
    const result = mergeJson(payload.baseInput, payload.overlayInput, payload.strategy);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
