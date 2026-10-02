import { handleMessage } from './yaml-path-eval.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { YamlPathPayload } from "@dude/tool-engine/tools/yaml-path/yaml-path-payload";

function messageEvent(id: string, payload: YamlPathPayload): MessageEvent<WorkerRequestMessage<YamlPathPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<YamlPathPayload>>;
}

describe('yaml-path-eval.worker handleMessage', () => {
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

  it('posts a result message evaluating a JSONPath query', () => {
    handleMessage(messageEvent('job-1', { yamlInput: 'a: 1\n', query: '$.a', language: 'jsonpath' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; output: string } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result).toEqual({ ok: true, output: JSON.stringify([1], null, 2) });
  });

  it('posts a result message carrying a parse error', () => {
    handleMessage(messageEvent('job-2', { yamlInput: 'a: [1,2\n', query: '$.a', language: 'jsonpath' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
