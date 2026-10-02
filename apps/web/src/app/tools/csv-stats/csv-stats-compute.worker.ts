import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { computeCsvStats } from "@dude/tool-engine/tools/csv-stats/csv-stats-compute";
import { CsvStatsPayload } from "@dude/tool-engine/tools/csv-stats/csv-stats-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<CsvStatsPayload>>): void {
  const { id, payload } = data;

  try {
    const result = computeCsvStats(payload.input);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
