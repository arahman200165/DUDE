import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { processToml } from "@dude/tool-engine/tools/toml-formatter/toml-format";
import { TomlFormatPayload } from "@dude/tool-engine/tools/toml-formatter/toml-format-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<TomlFormatPayload>>): void {
  const { id, payload } = data;

  try {
    const result = processToml(payload.input, payload.mode);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
