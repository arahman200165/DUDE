import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { pivotCsv } from "@dude/tool-engine/tools/csv-pivot/csv-pivot-transform";
import { CsvPivotPayload } from "@dude/tool-engine/tools/csv-pivot/csv-pivot-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<CsvPivotPayload>>): void {
  const { id, payload } = data;

  try {
    const result = pivotCsv(payload.input, payload.rowKeyColumn, payload.columnKeyColumn, payload.valueColumn, payload.aggregation);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
