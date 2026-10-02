import { handleMessage } from './json-patch-generate.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { JsonPatchGeneratePayload } from "@dude/tool-engine/tools/json-patch-generate/json-patch-generate-payload";

function messageEvent(
  id: string,
  payload: JsonPatchGeneratePayload,
): MessageEvent<WorkerRequestMessage<JsonPatchGeneratePayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<JsonPatchGeneratePayload>>;
}

describe('json-patch-generate.worker handleMessage', () => {
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

  it('posts a result message with the generated patch', () => {
    handleMessage(messageEvent('job-1', { beforeInput: '{"a":1}', afterInput: '{"a":2}' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; output: string } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result).toEqual({ ok: true, output: JSON.stringify([{ op: 'replace', path: '/a', value: 2 }], null, 2) });
  });

  it('posts a result message carrying a parse error', () => {
    handleMessage(messageEvent('job-2', { beforeInput: '{"a": }', afterInput: '{}' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
