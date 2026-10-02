import { handleMessage } from './toml-format.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { TomlFormatPayload } from "@dude/tool-engine/tools/toml-formatter/toml-format-payload";

function messageEvent(id: string, payload: TomlFormatPayload): MessageEvent<WorkerRequestMessage<TomlFormatPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<TomlFormatPayload>>;
}

describe('toml-format.worker handleMessage', () => {
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

  it('posts a result message with reformatted TOML', () => {
    handleMessage(messageEvent('job-1', { input: 'a="x"\n', mode: 'format' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; output: string } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result).toEqual({ ok: true, output: 'a = "x"\n' });
  });

  it('posts a result message carrying a parse error', () => {
    handleMessage(messageEvent('job-2', { input: 'a = [1,2\n', mode: 'format' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
