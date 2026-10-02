import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { extractStringsReport } from "@dude/tool-engine/tools/binary-strings-extractor/binary-strings-extractor-logic";
import { BinaryStringsExtractorWorkerPayload, BinaryStringsExtractorWorkerResult } from "@dude/tool-engine/tools/binary-strings-extractor/binary-strings-extractor-worker-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<BinaryStringsExtractorWorkerPayload>>): void {
  const { id, payload } = data;

  try {
    const result: BinaryStringsExtractorWorkerResult = extractStringsReport(new Uint8Array(payload.buffer), payload.options);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
