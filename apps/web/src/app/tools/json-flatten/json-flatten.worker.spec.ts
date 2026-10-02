import { handleMessage } from './json-flatten.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { JsonFlattenPayload } from "@dude/tool-engine/tools/json-flatten/json-flatten-payload";

function messageEvent(id: string, payload: JsonFlattenPayload): MessageEvent<WorkerRequestMessage<JsonFlattenPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<JsonFlattenPayload>>;
}

describe('json-flatten.worker handleMessage', () => {
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

  it('posts a result message flattening JSON', () => {
    handleMessage(messageEvent('job-1', { input: '{"a":{"b":1}}', direction: 'flatten' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; output: string } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result).toEqual({ ok: true, output: JSON.stringify({ 'a.b': 1 }, null, 2) });
  });

  it('posts a result message carrying a parse error', () => {
    handleMessage(messageEvent('job-2', { input: '{"a": }', direction: 'flatten' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
