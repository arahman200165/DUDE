import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { decryptChaCha, encryptChaCha } from "@dude/tool-engine/tools/chacha20-poly1305/chacha-cipher";
import { ChachaWorkerPayload, ChachaWorkerResult } from "@dude/tool-engine/tools/chacha20-poly1305/chacha-cipher-payload";

async function run(payload: ChachaWorkerPayload): Promise<ChachaWorkerResult> {
  if (payload.op === 'encrypt') {
    const { bundle } = await encryptChaCha(payload.plaintext, payload.passphrase, payload.variant, payload.iterations);
    return { op: 'encrypt', bundle };
  }
  const result = await decryptChaCha(payload.bundle, payload.passphrase);
  return { op: 'decrypt', result };
}

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<ChachaWorkerPayload>>): void {
  const { id, payload } = data;

  run(payload)
    .then((result) => postMessage(resultMessage(id, result)))
    .catch((error: unknown) => postMessage(errorMessage(id, error)));
}

addEventListener('message', handleMessage);
