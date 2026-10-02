import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { evaluateYamlPath } from "@dude/tool-engine/tools/yaml-path/yaml-path-eval";
import { YamlPathPayload } from "@dude/tool-engine/tools/yaml-path/yaml-path-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<YamlPathPayload>>): void {
  const { id, payload } = data;

  try {
    const result = evaluateYamlPath(payload.yamlInput, payload.query, payload.language);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
