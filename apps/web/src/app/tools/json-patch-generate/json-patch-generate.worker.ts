import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { generateJsonPatch } from "@dude/tool-engine/tools/json-patch-generate/json-patch-generate-transform";
import { JsonPatchGeneratePayload } from "@dude/tool-engine/tools/json-patch-generate/json-patch-generate-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<JsonPatchGeneratePayload>>): void {
  const { id, payload } = data;

  try {
    const result = generateJsonPatch(payload.beforeInput, payload.afterInput);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
