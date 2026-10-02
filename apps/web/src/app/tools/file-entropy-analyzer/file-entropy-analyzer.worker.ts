import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { analyzeFileEntropy } from "@dude/tool-engine/tools/file-entropy-analyzer/file-entropy-analyzer-logic";
import { FileEntropyAnalyzerWorkerPayload, FileEntropyAnalyzerWorkerResult } from "@dude/tool-engine/tools/file-entropy-analyzer/file-entropy-analyzer-worker-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<FileEntropyAnalyzerWorkerPayload>>): void {
  const { id, payload } = data;

  try {
    const result: FileEntropyAnalyzerWorkerResult = analyzeFileEntropy(new Uint8Array(payload.buffer), payload.windowSize);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
