import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { convertProperties } from "@dude/tool-engine/tools/properties-parser/properties-convert";
import { PropertiesConvertPayload } from "@dude/tool-engine/tools/properties-parser/properties-convert-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<PropertiesConvertPayload>>): void {
  const { id, payload } = data;

  try {
    const result = convertProperties(payload.input, payload.direction);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
