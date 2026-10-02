import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { decodeBase64ToBytes, encodeFileToBase64 } from "@dude/tool-engine/tools/file-base64/file-base64-codec";
import { FileBase64WorkerPayload, FileBase64WorkerResult } from "@dude/tool-engine/tools/file-base64/file-base64-worker-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<FileBase64WorkerPayload>>): void {
  const { id, payload } = data;

  try {
    const result: FileBase64WorkerResult =
      payload.direction === 'encode'
        ? { direction: 'encode', base64: encodeFileToBase64(payload.buffer) }
        : { direction: 'decode', decoded: decodeBase64ToBytes(payload.base64) };
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
