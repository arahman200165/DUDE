import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { findMatches, replaceMatches } from "@dude/tool-engine/tools/regex/regex-match";
import { RegexWorkerPayload } from "@dude/tool-engine/tools/regex/regex-match-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<RegexWorkerPayload>>): void {
  const { id, payload } = data;

  try {
    const result =
      payload.kind === 'replace'
        ? replaceMatches(payload.pattern, payload.flags, payload.testText, payload.replacement)
        : findMatches(payload.pattern, payload.flags, payload.testText);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
