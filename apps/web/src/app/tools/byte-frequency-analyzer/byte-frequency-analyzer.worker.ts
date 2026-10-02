import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { analyzeByteFrequency } from "@dude/tool-engine/tools/byte-frequency-analyzer/byte-frequency-analyzer-logic";
import { ByteFrequencyAnalyzerWorkerPayload, ByteFrequencyAnalyzerWorkerResult } from "@dude/tool-engine/tools/byte-frequency-analyzer/byte-frequency-analyzer-worker-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<ByteFrequencyAnalyzerWorkerPayload>>): void {
  const { id, payload } = data;

  try {
    const result: ByteFrequencyAnalyzerWorkerResult = analyzeByteFrequency(new Uint8Array(payload.buffer));
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
