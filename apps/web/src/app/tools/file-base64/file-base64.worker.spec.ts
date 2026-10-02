import { handleMessage } from './file-base64.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { FileBase64WorkerPayload } from "@dude/tool-engine/tools/file-base64/file-base64-worker-payload";

function messageEvent(
  id: string,
  payload: FileBase64WorkerPayload,
): MessageEvent<WorkerRequestMessage<FileBase64WorkerPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<FileBase64WorkerPayload>>;
}

describe('file-base64.worker handleMessage', () => {
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

  it('posts an encode result for an encode payload', () => {
    const buffer = new TextEncoder().encode('abc').buffer;
    handleMessage(messageEvent('job-1', { direction: 'encode', buffer }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { direction: string; base64: string } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result).toEqual({ direction: 'encode', base64: btoa('abc') });
  });

  it('posts a decode result for a decode payload', () => {
    handleMessage(messageEvent('job-2', { direction: 'decode', base64: btoa('abc') }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { direction: string; decoded: { ok: boolean } } };
    expect(message.result.direction).toBe('decode');
    expect(message.result.decoded.ok).toBe(true);
  });

  it('posts an error message when the handler throws', () => {
    handleMessage(messageEvent('job-3', { direction: 'encode', buffer: -1 as unknown as ArrayBuffer }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; error: { message: string } };
    expect(message.kind).toBe('error');
  });
});
