import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { BenchmarkPayload, timeSample } from "@dude/tool-engine/tools/regex-benchmark/regex-benchmark-run";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<BenchmarkPayload>>): void {
  const { id, payload } = data;

  try {
    postMessage(resultMessage(id, timeSample(payload)));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
