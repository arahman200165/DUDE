import { handleMessage } from './properties-convert.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { PropertiesConvertPayload } from "@dude/tool-engine/tools/properties-parser/properties-convert-payload";

function messageEvent(
  id: string,
  payload: PropertiesConvertPayload,
): MessageEvent<WorkerRequestMessage<PropertiesConvertPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<PropertiesConvertPayload>>;
}

describe('properties-convert.worker handleMessage', () => {
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

  it('posts a result message converting properties to JSON', () => {
    handleMessage(messageEvent('job-1', { input: 'a=1\n', direction: 'properties-to-json' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; output: string } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result).toEqual({ ok: true, output: JSON.stringify({ a: '1' }, null, 2) });
  });

  it('posts a result message carrying a parse error', () => {
    handleMessage(messageEvent('job-2', { input: '{"a": }', direction: 'json-to-properties' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
