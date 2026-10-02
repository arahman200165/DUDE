import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { convertCsvSql } from "@dude/tool-engine/tools/csv-sql/csv-sql-transform";
import { CsvSqlPayload } from "@dude/tool-engine/tools/csv-sql/csv-sql-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<CsvSqlPayload>>): void {
  const { id, payload } = data;

  try {
    const result = convertCsvSql(payload.input, payload.direction, payload.tableName);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
