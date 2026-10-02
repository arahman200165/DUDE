import { handleMessage } from './binary-strings-extractor.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { BinaryStringsExtractorWorkerPayload } from "@dude/tool-engine/tools/binary-strings-extractor/binary-strings-extractor-worker-payload";

function messageEvent(
  id: string,
  payload: BinaryStringsExtractorWorkerPayload,
): MessageEvent<WorkerRequestMessage<BinaryStringsExtractorWorkerPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<BinaryStringsExtractorWorkerPayload>>;
}

describe('binary-strings-extractor.worker handleMessage', () => {
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

  it('posts a strings report for a valid buffer', () => {
    const buffer = new TextEncoder().encode('\u0000hello\u0000').buffer;
    handleMessage(messageEvent('job-1', { buffer, options: { minLength: 4, includeAscii: true, includeUtf16Le: false } }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { strings: readonly { text: string }[] } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result.strings).toEqual([{ offset: 1, text: 'hello', encoding: 'ascii' }]);
  });

  it('posts an error message when the handler throws', () => {
    handleMessage(messageEvent('job-2', { buffer: -1 as unknown as ArrayBuffer, options: { minLength: 4, includeAscii: true, includeUtf16Le: false } }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; error: { message: string } };
    expect(message.kind).toBe('error');
  });
});
