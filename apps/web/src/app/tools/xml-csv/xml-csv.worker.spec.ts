import { handleMessage } from './xml-csv.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { XmlCsvPayload } from "@dude/tool-engine/tools/xml-csv/xml-csv-payload";

function messageEvent(id: string, payload: XmlCsvPayload): MessageEvent<WorkerRequestMessage<XmlCsvPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<XmlCsvPayload>>;
}

describe('xml-csv.worker handleMessage', () => {
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

  it('posts a result message converting XML to CSV', () => {
    handleMessage(messageEvent('job-1', { input: '<root><record><a>1</a></record></root>', direction: 'xml-to-csv', recordElement: '' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean; output: string } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result).toEqual({ ok: true, output: 'a\n1' });
  });

  it('posts a result message carrying an error', () => {
    handleMessage(messageEvent('job-2', { input: '', direction: 'xml-to-csv', recordElement: '' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { ok: boolean } };
    expect(message.result.ok).toBe(false);
  });
});
