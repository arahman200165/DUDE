import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { computeMatrixOp } from "@dude/tool-engine/tools/matrix-calculator/matrix-calculate";
import { MatrixWorkerPayload, MatrixWorkerResult } from "@dude/tool-engine/tools/matrix-calculator/matrix-worker-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<MatrixWorkerPayload>>): void {
  const { id, payload } = data;

  try {
    const result: MatrixWorkerResult = computeMatrixOp(payload.a, payload.b, payload.op, payload.scalar);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
