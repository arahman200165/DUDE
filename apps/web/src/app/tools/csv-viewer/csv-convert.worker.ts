import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { convertCsv } from "@dude/tool-engine/tools/csv-viewer/csv-convert";
import { CsvConvertPayload } from "@dude/tool-engine/tools/csv-viewer/csv-convert-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<CsvConvertPayload>>): void {
  const { id, payload } = data;

  try {
    const result = convertCsv(payload.input, payload.direction, payload.delimiter, payload.hasHeaderRow);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
