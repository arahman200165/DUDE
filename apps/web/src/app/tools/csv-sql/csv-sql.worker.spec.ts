import { handleMessage } from './csv-sql.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { CsvSqlPayload } from "@dude/tool-engine/tools/csv-sql/csv-sql-payload";

function messageEvent(id: string, payload: CsvSqlPayload): MessageEvent<WorkerRequestMessage<CsvSqlPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<CsvSqlPayload>>;
}

describe('csv-sql.worker handleMessage', () => {
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

  it('posts a result message converting CSV to SQL', () => {
    handleMessage(messageEvent('job-1', { input: 'id\n1\n', direction: 'csv-to-sql', tableName: 't' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; output: string } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result).toEqual({ ok: true, output: 'INSERT INTO t (id) VALUES (1);' });
  });

  it('posts a result message carrying an error', () => {
    handleMessage(messageEvent('job-2', { input: '', direction: 'csv-to-sql', tableName: 't' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
