import { handleMessage } from './file-inspector.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { FileInspectorWorkerPayload } from "@dude/tool-engine/tools/file-inspector/file-inspector-worker-payload";

function messageEvent(id: string, payload: FileInspectorWorkerPayload): MessageEvent<WorkerRequestMessage<FileInspectorWorkerPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<FileInspectorWorkerPayload>>;
}

describe('file-inspector.worker handleMessage', () => {
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

  it('posts an inspection report for a valid buffer', () => {
    const buffer = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer;
    handleMessage(messageEvent('job-1', { buffer, fileName: 'doc.pdf', declaredMime: 'application/pdf' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { detectedSignature: { mime: string } | null } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result.detectedSignature?.mime).toBe('application/pdf');
  });

  it('posts an error message when the handler throws', () => {
    handleMessage(messageEvent('job-2', { buffer: -1 as unknown as ArrayBuffer, fileName: 'x', declaredMime: null }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; error: { message: string } };
    expect(message.kind).toBe('error');
  });
});
