import { handleMessage } from './text-diff.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { TextDiffPayload } from "@dude/tool-engine/tools/diff/text-diff-payload";

function messageEvent(id: string, payload: TextDiffPayload): MessageEvent<WorkerRequestMessage<TextDiffPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<TextDiffPayload>>;
}

describe('text-diff.worker handleMessage', () => {
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

  it('posts a result message with the computed diff for a valid payload', () => {
    handleMessage(messageEvent('job-1', { left: 'a\nb\n', right: 'a\nc\n' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as {
      id: string;
      kind: string;
      result: { lines: { type: string; text: string }[]; summary: { added: number; removed: number; unchanged: number } };
    };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result.summary).toEqual({ added: 1, removed: 1, unchanged: 1 });
  });
});
