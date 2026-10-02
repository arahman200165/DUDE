import { handleMessage } from './xml-format.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { XmlFormatPayload } from "@dude/tool-engine/tools/xml-formatter/xml-format-payload";

function messageEvent(id: string, payload: XmlFormatPayload): MessageEvent<WorkerRequestMessage<XmlFormatPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<XmlFormatPayload>>;
}

describe('xml-format.worker handleMessage', () => {
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

  it('posts a result message with formatted XML', () => {
    handleMessage(messageEvent('job-1', { input: '<a><b>1</b></a>', mode: 'format', indent: 2 }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; output: string } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result).toEqual({ ok: true, output: '<a>\n  <b>1</b>\n</a>' });
  });

  it('posts a result message carrying a validation error', () => {
    handleMessage(messageEvent('job-2', { input: '<a><b></a>', mode: 'format', indent: 2 }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
