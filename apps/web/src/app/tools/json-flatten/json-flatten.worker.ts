import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { flattenJson } from "@dude/tool-engine/tools/json-flatten/json-flatten-transform";
import { JsonFlattenPayload } from "@dude/tool-engine/tools/json-flatten/json-flatten-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<JsonFlattenPayload>>): void {
  const { id, payload } = data;

  try {
    const result = flattenJson(payload.input, payload.direction);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
