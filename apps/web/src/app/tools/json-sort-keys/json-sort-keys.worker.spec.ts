import { handleMessage } from './json-sort-keys.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { JsonSortKeysPayload } from "@dude/tool-engine/tools/json-sort-keys/json-sort-keys-payload";

function messageEvent(id: string, payload: JsonSortKeysPayload): MessageEvent<WorkerRequestMessage<JsonSortKeysPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<JsonSortKeysPayload>>;
}

describe('json-sort-keys.worker handleMessage', () => {
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

  it('posts a result message with sorted keys', () => {
    handleMessage(messageEvent('job-1', { input: '{"b":1,"a":2}', recursive: false, order: 'asc' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; output: string } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result).toEqual({ ok: true, output: JSON.stringify({ a: 2, b: 1 }, null, 2) });
  });

  it('posts a result message carrying a parse error', () => {
    handleMessage(messageEvent('job-2', { input: '{"a": }', recursive: false, order: 'asc' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
