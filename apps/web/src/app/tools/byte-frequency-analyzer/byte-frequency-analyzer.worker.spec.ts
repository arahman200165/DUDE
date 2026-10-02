import { handleMessage } from './byte-frequency-analyzer.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { ByteFrequencyAnalyzerWorkerPayload } from "@dude/tool-engine/tools/byte-frequency-analyzer/byte-frequency-analyzer-worker-payload";

function messageEvent(id: string, payload: ByteFrequencyAnalyzerWorkerPayload): MessageEvent<WorkerRequestMessage<ByteFrequencyAnalyzerWorkerPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<ByteFrequencyAnalyzerWorkerPayload>>;
}

describe('byte-frequency-analyzer.worker handleMessage', () => {
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

  it('posts a frequency report for a valid buffer', () => {
    const buffer = new Uint8Array([0x41, 0x41, 0x42]).buffer;
    handleMessage(messageEvent('job-1', { buffer }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { mostFrequentByte: number; maxCount: number } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result.mostFrequentByte).toBe(0x41);
    expect(message.result.maxCount).toBe(2);
  });

  it('posts an error message when the handler throws', () => {
    handleMessage(messageEvent('job-2', { buffer: -1 as unknown as ArrayBuffer }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; error: { message: string } };
    expect(message.kind).toBe('error');
  });
});
