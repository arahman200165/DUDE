import { handleMessage } from './markdown-workspace.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { MarkdownWorkspacePayload } from "@dude/tool-engine/tools/markdown-workspace/markdown-workspace-payload";

function messageEvent(
  id: string,
  payload: MarkdownWorkspacePayload,
): MessageEvent<WorkerRequestMessage<MarkdownWorkspacePayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<MarkdownWorkspacePayload>>;
}

describe('markdown-workspace.worker handleMessage', () => {
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

  it('posts a result message with the (unsanitized) render result', () => {
    handleMessage(messageEvent('job-1', { source: '# Title\n' }));

    expect(posted).toHaveLength(1);
    const message = posted[0] as { id: string; kind: string; result: { renderedHtmlRaw: string } };
    expect(message.id).toBe('job-1');
    expect(message.kind).toBe('result');
    expect(message.result.renderedHtmlRaw).toContain('Title');
  });
});
