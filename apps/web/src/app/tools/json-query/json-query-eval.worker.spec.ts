import { handleMessage } from './json-query-eval.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { JsonQueryPayload } from "@dude/tool-engine/tools/json-query/json-query-payload";

function messageEvent(id: string, payload: JsonQueryPayload): MessageEvent<WorkerRequestMessage<JsonQueryPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<JsonQueryPayload>>;
}

describe('json-query-eval.worker handleMessage', () => {
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

  it('posts a result message for a matching JSONPath query', () => {
    handleMessage(messageEvent('job-1', { jsonInput: '{"a":1}', query: '$.a', language: 'jsonpath' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; output: string } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result).toEqual({ ok: true, output: JSON.stringify([1], null, 2) });
  });

  it('posts a result message carrying a query error', () => {
    handleMessage(messageEvent('job-2', { jsonInput: '{"a":1}', query: 'a[', language: 'jmespath' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
