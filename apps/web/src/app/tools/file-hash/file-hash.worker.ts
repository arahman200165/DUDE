import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { HashOutput, computeFileHashes } from "@dude/crypto/hash-compute";
import { FileHashPayload } from "@dude/tool-engine/tools/file-hash/file-hash-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<FileHashPayload>>): void {
  const { id, payload } = data;

  computeFileHashes(payload.buffer, payload.algorithms)
    .then((result: readonly HashOutput[]) => postMessage(resultMessage(id, result)))
    .catch((error: unknown) => postMessage(errorMessage(id, error)));
}

addEventListener('message', handleMessage);
