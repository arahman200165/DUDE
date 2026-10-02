import { handleMessage } from './directory-diff.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { DirectoryDiffPayload } from "@dude/tool-engine/tools/directory-diff/directory-tree-diff";

function messageEvent(id: string, payload: DirectoryDiffPayload): MessageEvent<WorkerRequestMessage<DirectoryDiffPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<DirectoryDiffPayload>>;
}

function bufferOf(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer;
}

describe('directory-diff.worker handleMessage', () => {
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

  it('posts a result message with diff entries', async () => {
    const buffer = bufferOf('hello');
    await handleMessage(
      messageEvent('job-1', {
        left: [{ path: 'a.txt', size: buffer.byteLength, buffer }],
        right: [],
      }),
    );

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: unknown[] };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result).toEqual([{ path: 'a.txt', status: 'removed', leftSize: 5 }]);
  });
});
