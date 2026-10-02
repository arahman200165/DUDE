import { handleMessage } from './csv-delimiter-detect.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { CsvDelimiterDetectPayload } from "@dude/tool-engine/tools/csv-delimiter-detector/csv-delimiter-detect-payload";

function messageEvent(
  id: string,
  payload: CsvDelimiterDetectPayload,
): MessageEvent<WorkerRequestMessage<CsvDelimiterDetectPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<CsvDelimiterDetectPayload>>;
}

describe('csv-delimiter-detect.worker handleMessage', () => {
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

  it('posts a result message with the detected delimiter', () => {
    handleMessage(messageEvent('job-1', { input: 'a;b\n1;2\n' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; delimiter: string } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result.ok).toBe(true);
    expect(message.result.delimiter).toBe(';');
  });

  it('posts a result message carrying an error', () => {
    handleMessage(messageEvent('job-2', { input: '' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
