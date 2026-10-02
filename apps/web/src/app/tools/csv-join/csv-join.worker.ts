import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { joinCsv } from "@dude/tool-engine/tools/csv-join/csv-join-transform";
import { CsvJoinPayload } from "@dude/tool-engine/tools/csv-join/csv-join-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<CsvJoinPayload>>): void {
  const { id, payload } = data;

  try {
    const result = joinCsv(payload.leftInput, payload.rightInput, payload.leftKey, payload.rightKey, payload.joinType);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
