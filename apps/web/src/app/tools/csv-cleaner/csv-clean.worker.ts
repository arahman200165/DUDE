import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { cleanCsv } from "@dude/tool-engine/tools/csv-cleaner/csv-clean";
import { CsvCleanPayload } from "@dude/tool-engine/tools/csv-cleaner/csv-clean-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<CsvCleanPayload>>): void {
  const { id, payload } = data;

  try {
    const result = cleanCsv(payload.input, payload.options);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
