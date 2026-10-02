import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { testJsonPatch } from "@dude/tool-engine/tools/json-patch-test/json-patch-test-transform";
import { JsonPatchTestPayload } from "@dude/tool-engine/tools/json-patch-test/json-patch-test-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<JsonPatchTestPayload>>): void {
  const { id, payload } = data;

  try {
    const result = testJsonPatch(payload.documentInput, payload.patchInput);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
