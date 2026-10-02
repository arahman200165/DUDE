import { handleMessage } from './csv-convert.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { CsvConvertPayload } from "@dude/tool-engine/tools/csv-viewer/csv-convert-payload";

function messageEvent(id: string, payload: CsvConvertPayload): MessageEvent<WorkerRequestMessage<CsvConvertPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<CsvConvertPayload>>;
}

describe('csv-convert.worker handleMessage', () => {
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

  it('posts a result message converting CSV to JSON', () => {
    handleMessage(messageEvent('job-1', { input: 'a,b\n1,2', direction: 'csv-to-json', delimiter: ',', hasHeaderRow: true }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; output: string } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result).toEqual({ ok: true, output: JSON.stringify([{ a: '1', b: '2' }], null, 2) });
  });

  it('posts a result message carrying a conversion error', () => {
    handleMessage(messageEvent('job-2', { input: '', direction: 'csv-to-json', delimiter: ',', hasHeaderRow: true }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
