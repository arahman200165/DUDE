import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { buildWorkspaceResult } from "@dude/tool-engine/tools/markdown-workspace/markdown-workspace-render";
import { MarkdownWorkspacePayload } from "@dude/tool-engine/tools/markdown-workspace/markdown-workspace-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<MarkdownWorkspacePayload>>): void {
  const { id, payload } = data;

  try {
    const result = buildWorkspaceResult(payload.source);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
