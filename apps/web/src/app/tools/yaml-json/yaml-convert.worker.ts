import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { convertYaml } from "@dude/tool-engine/tools/yaml-json/yaml-convert";
import { YamlConvertPayload } from "@dude/tool-engine/tools/yaml-json/yaml-convert-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<YamlConvertPayload>>): void {
  const { id, payload } = data;

  try {
    const result = convertYaml(payload.input, payload.direction, payload.indent);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
