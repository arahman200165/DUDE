import { handleMessage } from './json-patch-test.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { JsonPatchTestPayload } from "@dude/tool-engine/tools/json-patch-test/json-patch-test-payload";

function messageEvent(id: string, payload: JsonPatchTestPayload): MessageEvent<WorkerRequestMessage<JsonPatchTestPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<JsonPatchTestPayload>>;
}

describe('json-patch-test.worker handleMessage', () => {
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

  it('posts a result message with the patched document', () => {
    handleMessage(messageEvent('job-1', { documentInput: '{"a":1}', patchInput: '[{"op":"replace","path":"/a","value":2}]' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; output: string } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result).toEqual({ ok: true, output: JSON.stringify({ a: 2 }, null, 2) });
  });

  it('posts a result message carrying a parse error', () => {
    handleMessage(messageEvent('job-2', { documentInput: '{"a": }', patchInput: '[]' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
