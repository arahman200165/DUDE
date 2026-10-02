import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { diffDirectoryPayload, DirectoryDiffPayload } from "@dude/tool-engine/tools/directory-diff/directory-tree-diff";

export async function handleMessage({ data }: MessageEvent<WorkerRequestMessage<DirectoryDiffPayload>>): Promise<void> {
  const { id, payload } = data;

  try {
    const entries = await diffDirectoryPayload(payload);
    postMessage(resultMessage(id, entries));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
