import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { processXml } from "@dude/tool-engine/tools/xml-formatter/xml-format";
import { XmlFormatPayload } from "@dude/tool-engine/tools/xml-formatter/xml-format-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<XmlFormatPayload>>): void {
  const { id, payload } = data;

  try {
    const result = processXml(payload.input, payload.mode, payload.indent);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
