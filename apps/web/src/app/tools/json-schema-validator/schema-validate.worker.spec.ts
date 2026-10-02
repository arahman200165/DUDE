import { handleMessage } from './schema-validate.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { SchemaValidatePayload } from "@dude/tool-engine/tools/json-schema-validator/schema-validate-payload";

function messageEvent(
  id: string,
  payload: SchemaValidatePayload,
): MessageEvent<WorkerRequestMessage<SchemaValidatePayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<SchemaValidatePayload>>;
}

describe('schema-validate.worker handleMessage', () => {
  let posted: unknown[];

  beforeEach(() => {
    posted = [];
    vi.stubGlobal(
      'postMessage',
      vi.fn((message: unknown) => posted.push(message)),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts a result message for a valid instance', () => {
    handleMessage(
      messageEvent('job-1', {
        schemaText: JSON.stringify({ type: 'string' }),
        instanceText: JSON.stringify('hello'),
        draftMode: 'auto',
      }),
    );

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result.ok).toBe(true);
  });

  it('posts a result message carrying validation errors for an invalid instance', () => {
    handleMessage(
      messageEvent('job-2', {
        schemaText: JSON.stringify({ type: 'string' }),
        instanceText: JSON.stringify(42),
        draftMode: 'auto',
      }),
    );

    const message = posted[0] as { result: { ok: boolean; stage?: string } };
    expect(message.result.ok).toBe(false);
    expect(message.result.stage).toBe('validation');
  });
});
