import { handleMessage } from './json-format.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { JsonFormatPayload } from "@dude/tool-engine/tools/json/json-format-payload";

function messageEvent(id: string, payload: JsonFormatPayload): MessageEvent<WorkerRequestMessage<JsonFormatPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<JsonFormatPayload>>;
}

describe('json-format.worker handleMessage', () => {
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

  it('posts a result message with formatted output for valid JSON', () => {
    handleMessage(messageEvent('job-1', { input: '{"a":1}', mode: 'pretty', indent: 2 }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; output?: string } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result.ok).toBe(true);
    expect(message.result.output).toBe('{\n  "a": 1\n}');
  });

  it('posts a result message carrying a parse error for malformed JSON', () => {
    handleMessage(messageEvent('job-2', { input: '{not json}', mode: 'pretty', indent: 2 }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; error?: unknown } };
    expect(message.id).toBe('job-2');
    expect(message.kind).toBe('result');
    expect(message.result.ok).toBe(false);
    expect(message.result.error).toBeDefined();
  });
});
