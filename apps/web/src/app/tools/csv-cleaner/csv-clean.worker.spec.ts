import { handleMessage } from './csv-clean.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { CsvCleanPayload } from "@dude/tool-engine/tools/csv-cleaner/csv-clean-payload";

function messageEvent(id: string, payload: CsvCleanPayload): MessageEvent<WorkerRequestMessage<CsvCleanPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<CsvCleanPayload>>;
}

describe('csv-clean.worker handleMessage', () => {
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

  it('posts a result message with cleaned CSV', () => {
    handleMessage(messageEvent('job-1', { input: 'a, b \n', options: { trimCells: true, dropEmptyRows: true } }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; output: string } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result).toEqual({ ok: true, output: 'a,b' });
  });

  it('posts a result message carrying an error', () => {
    handleMessage(messageEvent('job-2', { input: '', options: { trimCells: true, dropEmptyRows: true } }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
