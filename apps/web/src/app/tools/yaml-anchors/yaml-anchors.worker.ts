import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { findYamlAnchors } from "@dude/tool-engine/tools/yaml-anchors/yaml-anchors-transform";
import { YamlAnchorsPayload } from "@dude/tool-engine/tools/yaml-anchors/yaml-anchors-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<YamlAnchorsPayload>>): void {
  const { id, payload } = data;

  try {
    const result = findYamlAnchors(payload.input);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
