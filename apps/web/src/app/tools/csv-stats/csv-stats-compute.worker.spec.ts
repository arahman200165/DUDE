import { handleMessage } from './csv-stats-compute.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { CsvStatsPayload } from "@dude/tool-engine/tools/csv-stats/csv-stats-payload";

function messageEvent(id: string, payload: CsvStatsPayload): MessageEvent<WorkerRequestMessage<CsvStatsPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<CsvStatsPayload>>;
}

describe('csv-stats-compute.worker handleMessage', () => {
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

  it('posts a result message with computed statistics', () => {
    handleMessage(messageEvent('job-1', { input: 'a\n1\n2\n' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; table: { rows: string[][] } } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result.ok).toBe(true);
    expect(message.result.table.rows).toEqual([['a', '2', '0', '2', '1', '2', '1.50']]);
  });

  it('posts a result message carrying an error', () => {
    handleMessage(messageEvent('job-2', { input: '' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
