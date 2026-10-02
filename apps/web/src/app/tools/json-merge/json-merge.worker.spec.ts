import { handleMessage } from './json-merge.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { JsonMergePayload } from "@dude/tool-engine/tools/json-merge/json-merge-payload";

function messageEvent(id: string, payload: JsonMergePayload): MessageEvent<WorkerRequestMessage<JsonMergePayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<JsonMergePayload>>;
}

describe('json-merge.worker handleMessage', () => {
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

  it('posts a result message merging two JSON documents', () => {
    handleMessage(messageEvent('job-1', { baseInput: '{"a":1}', overlayInput: '{"b":2}', strategy: 'deep' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; output: string } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result).toEqual({ ok: true, output: JSON.stringify({ a: 1, b: 2 }, null, 2) });
  });

  it('posts a result message carrying a parse error', () => {
    handleMessage(messageEvent('job-2', { baseInput: '{"a": }', overlayInput: '{}', strategy: 'deep' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
