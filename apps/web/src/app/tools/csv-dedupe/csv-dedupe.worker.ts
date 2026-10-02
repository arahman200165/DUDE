import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { dedupeCsv } from "@dude/tool-engine/tools/csv-dedupe/csv-dedupe-transform";
import { CsvDedupePayload } from "@dude/tool-engine/tools/csv-dedupe/csv-dedupe-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<CsvDedupePayload>>): void {
  const { id, payload } = data;

  try {
    const result = dedupeCsv(payload.input, payload.keyColumnsInput);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
