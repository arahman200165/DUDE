import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { formatHexDump, parseHexDump } from "@dude/tool-engine/tools/hex-dump/hex-dump-codec";
import { HexDumpWorkerPayload, HexDumpWorkerResult } from "@dude/tool-engine/tools/hex-dump/hex-dump-worker-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<HexDumpWorkerPayload>>): void {
  const { id, payload } = data;

  try {
    const result: HexDumpWorkerResult =
      payload.direction === 'toHexDump'
        ? { direction: 'toHexDump', dump: formatHexDump(new Uint8Array(payload.buffer)) }
        : { direction: 'toFile', parsed: parseHexDump(payload.dump) };
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
