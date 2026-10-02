import { handleMessage } from './yaml-lint.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { YamlLintPayload } from "@dude/tool-engine/tools/yaml-linter/yaml-lint-payload";

function messageEvent(id: string, payload: YamlLintPayload): MessageEvent<WorkerRequestMessage<YamlLintPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<YamlLintPayload>>;
}

describe('yaml-lint.worker handleMessage', () => {
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

  it('posts a result message for valid YAML', () => {
    handleMessage(messageEvent('job-1', { input: 'a: 1\n' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; documentCount: number } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result).toEqual({ ok: true, documentCount: 1 });
  });

  it('posts a result message carrying a parse error', () => {
    handleMessage(messageEvent('job-2', { input: 'a: [1,2\n' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
