import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { sortJsonKeys } from "@dude/tool-engine/tools/json-sort-keys/json-sort-keys-transform";
import { JsonSortKeysPayload } from "@dude/tool-engine/tools/json-sort-keys/json-sort-keys-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<JsonSortKeysPayload>>): void {
  const { id, payload } = data;

  try {
    const result = sortJsonKeys(payload.input, payload.recursive, payload.order);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
