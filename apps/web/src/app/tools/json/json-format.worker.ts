import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { processJson } from "@dude/tool-engine/tools/json/json-format";
import { JsonFormatPayload } from "@dude/tool-engine/tools/json/json-format-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<JsonFormatPayload>>): void {
  const { id, payload } = data;

  try {
    const result = processJson(payload.input, payload.mode, payload.indent);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
