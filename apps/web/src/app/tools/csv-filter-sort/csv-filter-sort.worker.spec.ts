import { handleMessage } from './csv-filter-sort.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { CsvFilterSortPayload } from "@dude/tool-engine/tools/csv-filter-sort/csv-filter-sort-payload";

function messageEvent(id: string, payload: CsvFilterSortPayload): MessageEvent<WorkerRequestMessage<CsvFilterSortPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<CsvFilterSortPayload>>;
}

describe('csv-filter-sort.worker handleMessage', () => {
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

  it('posts a result message with the filtered/sorted table', () => {
    handleMessage(
      messageEvent('job-1', {
        input: 'name,age\nAlice,30\nBob,25\n',
        filterColumn: '',
        operator: 'contains',
        filterValue: '',
        sortColumn: 'age',
        sortDirection: 'asc',
      }),
    );

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; table: unknown } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result).toEqual({
      ok: true,
      table: { columns: ['name', 'age'], rows: [['Bob', '25'], ['Alice', '30']] },
    });
  });

  it('posts a result message carrying an error', () => {
    handleMessage(
      messageEvent('job-2', { input: '', filterColumn: '', operator: 'contains', filterValue: '', sortColumn: '', sortDirection: 'asc' }),
    );

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
