import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { detectCsvDelimiter } from "@dude/tool-engine/tools/csv-delimiter-detector/csv-delimiter-detect";
import { CsvDelimiterDetectPayload } from "@dude/tool-engine/tools/csv-delimiter-detector/csv-delimiter-detect-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<CsvDelimiterDetectPayload>>): void {
  const { id, payload } = data;

  try {
    const result = detectCsvDelimiter(payload.input);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
