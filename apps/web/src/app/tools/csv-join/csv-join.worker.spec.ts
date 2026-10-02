import { handleMessage } from './csv-join.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { CsvJoinPayload } from "@dude/tool-engine/tools/csv-join/csv-join-payload";

function messageEvent(id: string, payload: CsvJoinPayload): MessageEvent<WorkerRequestMessage<CsvJoinPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<CsvJoinPayload>>;
}

describe('csv-join.worker handleMessage', () => {
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

  it('posts a result message with the joined table', () => {
    handleMessage(
      messageEvent('job-1', {
        leftInput: 'id,name\n1,Alice\n',
        rightInput: 'id,dept\n1,Eng\n',
        leftKey: 'id',
        rightKey: 'id',
        joinType: 'inner',
      }),
    );

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; table: unknown } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result).toEqual({
      ok: true,
      table: { columns: ['id', 'name', 'dept'], rows: [['1', 'Alice', 'Eng']] },
    });
  });

  it('posts a result message carrying an error', () => {
    handleMessage(messageEvent('job-2', { leftInput: '', rightInput: '', leftKey: 'id', rightKey: 'id', joinType: 'inner' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
