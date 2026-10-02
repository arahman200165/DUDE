import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { inspectFile } from "@dude/tool-engine/tools/file-inspector/file-inspector-logic";
import { FileInspectorWorkerPayload, FileInspectorWorkerResult } from "@dude/tool-engine/tools/file-inspector/file-inspector-worker-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<FileInspectorWorkerPayload>>): void {
  const { id, payload } = data;

  try {
    const result: FileInspectorWorkerResult = inspectFile(new Uint8Array(payload.buffer), payload.fileName, payload.declaredMime);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
