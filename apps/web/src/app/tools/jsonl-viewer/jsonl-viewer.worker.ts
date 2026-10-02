import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { parseJsonl } from "@dude/tool-engine/tools/jsonl-viewer/jsonl-viewer-transform";
import { JsonlViewerPayload } from "@dude/tool-engine/tools/jsonl-viewer/jsonl-viewer-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<JsonlViewerPayload>>): void {
  const { id, payload } = data;

  try {
    const result = parseJsonl(payload.input);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
