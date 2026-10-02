import { handleMessage } from './file-entropy-analyzer.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { FileEntropyAnalyzerWorkerPayload } from "@dude/tool-engine/tools/file-entropy-analyzer/file-entropy-analyzer-worker-payload";

function messageEvent(id: string, payload: FileEntropyAnalyzerWorkerPayload): MessageEvent<WorkerRequestMessage<FileEntropyAnalyzerWorkerPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<FileEntropyAnalyzerWorkerPayload>>;
}

describe('file-entropy-analyzer.worker handleMessage', () => {
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

  it('posts an entropy report for a valid buffer', () => {
    const buffer = new Uint8Array(1024).fill(0x41).buffer;
    handleMessage(messageEvent('job-1', { buffer, windowSize: 256 }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { verdict: string; byteLength: number } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result.verdict).toBe('low');
    expect(message.result.byteLength).toBe(1024);
  });

  it('posts an error message when the handler throws', () => {
    handleMessage(messageEvent('job-2', { buffer: new ArrayBuffer(8), windowSize: 0 }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; error: { message: string } };
    expect(message.kind).toBe('error');
  });
});
