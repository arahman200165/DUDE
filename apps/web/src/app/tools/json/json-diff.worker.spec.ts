import { handleMessage } from './json-diff.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { JsonDiffPayload } from "@dude/tool-engine/tools/json/json-diff-payload";

function messageEvent(id: string, payload: JsonDiffPayload): MessageEvent<WorkerRequestMessage<JsonDiffPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<JsonDiffPayload>>;
}

describe('json-diff.worker handleMessage', () => {
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

  it('posts a result message with diff entries for valid JSON on both sides', () => {
    handleMessage(messageEvent('job-1', { left: '{"a":1}', right: '{"a":2}' }));

    const message = posted[0] as { id: string; result: { ok: boolean; entries?: unknown[] } };
    expect(message.id).toBe('job-1');
    expect(message.result.ok).toBe(true);
    expect(message.result.entries).toHaveLength(1);
  });

  it('posts a result message naming the side that failed to parse', () => {
    handleMessage(messageEvent('job-2', { left: '{not json', right: '{}' }));

    const message = posted[0] as { result: { ok: boolean; side?: string } };
    expect(message.result.ok).toBe(false);
    expect(message.result.side).toBe('left');
  });
});
