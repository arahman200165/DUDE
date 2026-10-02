import { handleMessage } from './regex-benchmark.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { BenchmarkPayload } from "@dude/tool-engine/tools/regex-benchmark/regex-benchmark-run";

function messageEvent(id: string, payload: BenchmarkPayload): MessageEvent<WorkerRequestMessage<BenchmarkPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<BenchmarkPayload>>;
}

describe('regex-benchmark.worker handleMessage', () => {
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

  it('posts a result message with timing for a valid pattern', () => {
    handleMessage(messageEvent('job-1', { pattern: 'ban+a', flags: '', sample: 'banana' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; matched?: boolean; ms?: number } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result.ok).toBe(true);
    expect(message.result.matched).toBe(true);
    expect(typeof message.result.ms).toBe('number');
  });

  it('posts a result message with ok:false for an invalid pattern', () => {
    handleMessage(messageEvent('job-2', { pattern: '(', flags: '', sample: 'x' }));

    const message = posted[0] as { result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
