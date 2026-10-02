import '../../core/platform/worker-engine-host.adapter';
/// <reference lib="webworker" />

import { errorMessage, resultMessage, WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { validateJsonSchema } from "@dude/tool-engine/tools/json-schema-validator/schema-validate";
import { SchemaValidatePayload } from "@dude/tool-engine/tools/json-schema-validator/schema-validate-payload";

export function handleMessage({ data }: MessageEvent<WorkerRequestMessage<SchemaValidatePayload>>): void {
  const { id, payload } = data;

  try {
    const result = validateJsonSchema(payload.schemaText, payload.instanceText, payload.draftMode);
    postMessage(resultMessage(id, result));
  } catch (error) {
    postMessage(errorMessage(id, error));
  }
}

addEventListener('message', handleMessage);
