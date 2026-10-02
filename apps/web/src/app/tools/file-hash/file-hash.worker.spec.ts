import { handleMessage } from './file-hash.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { FileHashPayload } from "@dude/tool-engine/tools/file-hash/file-hash-payload";

function messageEvent(id: string, payload: FileHashPayload): MessageEvent<WorkerRequestMessage<FileHashPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<FileHashPayload>>;
}

describe('file-hash.worker handleMessage', () => {
  let posted: unknown[];
  let posted$: Promise<void>;

  beforeEach(() => {
    posted = [];
    // `handleMessage` posts exactly once (result or error) after its internal digest promise settles.
    // Waiting a fixed tick (e.g. `setTimeout(resolve, 0)`) raced with that promise under load (observed
    // flaking in CI) -- resolving on the post itself, per test, is deterministic instead.
    let resolvePosted: () => void;
    posted$ = new Promise((resolve) => {
      resolvePosted = resolve;
    });
    vi.stubGlobal(
      'postMessage',
      vi.fn((message: unknown) => {
        posted.push(message);
        resolvePosted();
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts a result message with computed digests for a valid buffer payload', async () => {
    const buffer = new TextEncoder().encode('hello').buffer;
    handleMessage(messageEvent('job-1', { buffer, algorithms: ['MD5', 'SHA-256'] }));
    await posted$;

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { algorithm: string; hex: string }[] };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result.map((r) => r.algorithm)).toEqual(['MD5', 'SHA-256']);
    expect(message.result.every((r) => /^[0-9a-f]+$/.test(r.hex))).toBe(true);
  });

  it('posts an error message when digest computation rejects', async () => {
    const digestSpy = vi.spyOn(crypto.subtle, 'digest').mockRejectedValueOnce(new Error('digest failed'));

    const buffer = new TextEncoder().encode('hello').buffer;
    handleMessage(messageEvent('job-2', { buffer, algorithms: ['SHA-256'] }));
    await posted$;

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; error: { message: string } };
    expect(message.id).toBe('job-2');
    expect(message.kind).toBe('error');
    expect(message.error.message).toBe('digest failed');

    digestSpy.mockRestore();
  });
});
