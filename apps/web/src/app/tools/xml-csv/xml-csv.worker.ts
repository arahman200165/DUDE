import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { convertXmlCsv } from "@dude/tool-engine/tools/xml-csv/xml-csv-transform";
import { XmlCsvPayload } from "@dude/tool-engine/tools/xml-csv/xml-csv-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<XmlCsvPayload>>): void {
  const { id, payload } = data;

  try {
    const result = convertXmlCsv(payload.input, payload.direction, payload.recordElement);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
