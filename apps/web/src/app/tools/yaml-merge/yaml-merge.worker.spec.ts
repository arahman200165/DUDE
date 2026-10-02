import { handleMessage } from './yaml-merge.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { YamlMergePayload } from "@dude/tool-engine/tools/yaml-merge/yaml-merge-payload";

function messageEvent(id: string, payload: YamlMergePayload): MessageEvent<WorkerRequestMessage<YamlMergePayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<YamlMergePayload>>;
}

describe('yaml-merge.worker handleMessage', () => {
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

  it('posts a result message merging two YAML documents', () => {
    handleMessage(messageEvent('job-1', { baseInput: 'a: 1\n', overlayInput: 'b: 2\n' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; output: string } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result).toEqual({ ok: true, output: 'a: 1\nb: 2\n' });
  });

  it('posts a result message carrying a parse error', () => {
    handleMessage(messageEvent('job-2', { baseInput: 'a: [1,2\n', overlayInput: 'b: 1\n' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
