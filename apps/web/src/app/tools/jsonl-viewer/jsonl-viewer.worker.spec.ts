import { handleMessage } from './jsonl-viewer.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { JsonlViewerPayload } from "@dude/tool-engine/tools/jsonl-viewer/jsonl-viewer-payload";

function messageEvent(id: string, payload: JsonlViewerPayload): MessageEvent<WorkerRequestMessage<JsonlViewerPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<JsonlViewerPayload>>;
}

describe('jsonl-viewer.worker handleMessage', () => {
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

  it('posts a result message with parsed records', () => {
    handleMessage(messageEvent('job-1', { input: '{"a":1}\n{"a":2}\n' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; result: { records: unknown[] } } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result.ok).toBe(true);
    expect(message.result.result.records).toEqual([{ a: 1 }, { a: 2 }]);
  });

  it('posts a result message carrying a parse error', () => {
    handleMessage(messageEvent('job-2', { input: '{"a": }' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
