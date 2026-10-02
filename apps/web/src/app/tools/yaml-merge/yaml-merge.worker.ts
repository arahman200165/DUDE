import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { mergeYaml } from "@dude/tool-engine/tools/yaml-merge/yaml-merge-transform";
import { YamlMergePayload } from "@dude/tool-engine/tools/yaml-merge/yaml-merge-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<YamlMergePayload>>): void {
  const { id, payload } = data;

  try {
    const result = mergeYaml(payload.baseInput, payload.overlayInput);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
