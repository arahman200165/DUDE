import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { resolveJsonPointer } from "@dude/tool-engine/tools/json-pointer/json-pointer-transform";
import { JsonPointerPayload } from "@dude/tool-engine/tools/json-pointer/json-pointer-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<JsonPointerPayload>>): void {
  const { id, payload } = data;

  try {
    const result = resolveJsonPointer(payload.jsonInput, payload.pointer);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
