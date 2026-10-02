import { handleMessage } from './csv-dedupe.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { CsvDedupePayload } from "@dude/tool-engine/tools/csv-dedupe/csv-dedupe-payload";

function messageEvent(id: string, payload: CsvDedupePayload): MessageEvent<WorkerRequestMessage<CsvDedupePayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<CsvDedupePayload>>;
}

describe('csv-dedupe.worker handleMessage', () => {
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

  it('posts a result message with deduped CSV', () => {
    handleMessage(messageEvent('job-1', { input: 'a,b\n1,2\n1,2\n', keyColumnsInput: '' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; output: string } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result).toEqual({ ok: true, output: 'a,b\n1,2' });
  });

  it('posts a result message carrying an error', () => {
    handleMessage(messageEvent('job-2', { input: '', keyColumnsInput: '' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
