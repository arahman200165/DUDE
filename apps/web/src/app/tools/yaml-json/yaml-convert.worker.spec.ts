import { handleMessage } from './yaml-convert.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { YamlConvertPayload } from "@dude/tool-engine/tools/yaml-json/yaml-convert-payload";

function messageEvent(id: string, payload: YamlConvertPayload): MessageEvent<WorkerRequestMessage<YamlConvertPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<YamlConvertPayload>>;
}

describe('yaml-convert.worker handleMessage', () => {
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

  it('posts a result message converting YAML to JSON', () => {
    handleMessage(messageEvent('job-1', { input: 'a: 1\n', direction: 'yaml-to-json', indent: 2 }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; output: string } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result).toEqual({ ok: true, output: '{\n  "a": 1\n}' });
  });

  it('posts a result message carrying a parse error', () => {
    handleMessage(messageEvent('job-2', { input: 'a: [1,2\n', direction: 'yaml-to-json', indent: 2 }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
