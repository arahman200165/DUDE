import { handleMessage } from './json-pointer.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { JsonPointerPayload } from "@dude/tool-engine/tools/json-pointer/json-pointer-payload";

function messageEvent(id: string, payload: JsonPointerPayload): MessageEvent<WorkerRequestMessage<JsonPointerPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<JsonPointerPayload>>;
}

describe('json-pointer.worker handleMessage', () => {
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

  it('posts a result message resolving a pointer', () => {
    handleMessage(messageEvent('job-1', { jsonInput: '{"a":{"b":1}}', pointer: '/a/b' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; output: string } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result).toEqual({ ok: true, output: '1' });
  });

  it('posts a result message carrying a parse error', () => {
    handleMessage(messageEvent('job-2', { jsonInput: '{"a": }', pointer: '/a' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
