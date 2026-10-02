import { handleMessage } from './yaml-anchors.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { YamlAnchorsPayload } from "@dude/tool-engine/tools/yaml-anchors/yaml-anchors-payload";

function messageEvent(id: string, payload: YamlAnchorsPayload): MessageEvent<WorkerRequestMessage<YamlAnchorsPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<YamlAnchorsPayload>>;
}

describe('yaml-anchors.worker handleMessage', () => {
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

  it('posts a result message with the discovered anchors', () => {
    handleMessage(messageEvent('job-1', { input: 'base: &base 1\na: *base\n' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; anchors: unknown[] } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result.ok).toBe(true);
    expect(message.result.anchors).toEqual([{ anchor: 'base', definitionPaths: ['base'], aliasPaths: ['a'] }]);
  });

  it('posts a result message carrying a parse error', () => {
    handleMessage(messageEvent('job-2', { input: 'a: [1,2\n' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
