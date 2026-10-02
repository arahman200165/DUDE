import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { lintYaml } from "@dude/tool-engine/tools/yaml-linter/yaml-lint";
import { YamlLintPayload } from "@dude/tool-engine/tools/yaml-linter/yaml-lint-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<YamlLintPayload>>): void {
  const { id, payload } = data;

  try {
    const result = lintYaml(payload.input);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
