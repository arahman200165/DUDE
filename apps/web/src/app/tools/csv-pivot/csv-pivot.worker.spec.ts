import { handleMessage } from './csv-pivot.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { CsvPivotPayload } from "@dude/tool-engine/tools/csv-pivot/csv-pivot-payload";

function messageEvent(id: string, payload: CsvPivotPayload): MessageEvent<WorkerRequestMessage<CsvPivotPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<CsvPivotPayload>>;
}

describe('csv-pivot.worker handleMessage', () => {
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

  it('posts a result message with the pivoted table', () => {
    handleMessage(
      messageEvent('job-1', {
        input: 'region,product,amount\nEast,A,10\n',
        rowKeyColumn: 'region',
        columnKeyColumn: 'product',
        valueColumn: 'amount',
        aggregation: 'sum',
      }),
    );

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; table: unknown } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result).toEqual({ ok: true, table: { columns: ['region', 'A'], rows: [['East', '10']] } });
  });

  it('posts a result message carrying an error', () => {
    handleMessage(
      messageEvent('job-2', { input: '', rowKeyColumn: 'a', columnKeyColumn: 'b', valueColumn: 'c', aggregation: 'sum' }),
    );

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
