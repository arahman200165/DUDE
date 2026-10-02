import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { convertIni } from "@dude/tool-engine/tools/ini-formatter/ini-convert";
import { IniConvertPayload } from "@dude/tool-engine/tools/ini-formatter/ini-convert-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<IniConvertPayload>>): void {
  const { id, payload } = data;

  try {
    const result = convertIni(payload.input, payload.direction);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
