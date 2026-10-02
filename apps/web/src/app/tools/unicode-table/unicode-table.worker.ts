import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { runUnicodeTableRequest, UnicodeTableRequest } from "@dude/tool-engine/tools/unicode-table/unicode-table-browse";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<UnicodeTableRequest>>): void {
  const { id, payload } = data;

  try {
    const result = runUnicodeTableRequest(payload);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
