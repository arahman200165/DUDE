import { handleMessage } from './advanced-diff.worker';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";
import { AdvancedDiffPayload } from "@dude/tool-engine/tools/advanced-diff/advanced-diff-payload";
import { NO_IGNORE_OPTIONS } from "@dude/tool-engine/tools/advanced-diff/diff-normalize";

function messageEvent(
  id: string,
  payload: AdvancedDiffPayload,
): MessageEvent<WorkerRequestMessage<AdvancedDiffPayload>> {
  return { data: { id, payload } } as MessageEvent<WorkerRequestMessage<AdvancedDiffPayload>>;
}

describe('advanced-diff.worker handleMessage', () => {
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

  it('always computes the line diff, with no fineDiff for line granularity', () => {
    handleMessage(messageEvent('job-1', { left: 'a\nb', right: 'a\nc', granularity: 'line', mode: 'text', ignoreOptions: NO_IGNORE_OPTIONS }));

    const message = posted[0] as { result: { lineDiff: unknown; fineDiff?: unknown } };
    expect(message.result.lineDiff).toBeDefined();
    expect(message.result.fineDiff).toBeUndefined();
  });

  it('includes a fineDiff for word granularity', () => {
    handleMessage(messageEvent('job-2', { left: 'the cat', right: 'the dog', granularity: 'word', mode: 'text', ignoreOptions: NO_IGNORE_OPTIONS }));

    const message = posted[0] as { result: { fineDiff?: { segments: unknown[] } } };
    expect(message.result.fineDiff?.segments.length).toBeGreaterThan(0);
  });

  it('includes a fineDiff for char granularity', () => {
    handleMessage(messageEvent('job-3', { left: 'cat', right: 'car', granularity: 'char', mode: 'text', ignoreOptions: NO_IGNORE_OPTIONS }));

    const message = posted[0] as { result: { fineDiff?: { segments: unknown[] } } };
    expect(message.result.fineDiff?.segments.length).toBeGreaterThan(0);
  });

  it('treats case-only differences as equal in the line diff when ignoreCase is set', () => {
    handleMessage(
      messageEvent('job-4', {
        left: 'Hello',
        right: 'hello',
        granularity: 'line',
        mode: 'text',
        ignoreOptions: { ...NO_IGNORE_OPTIONS, ignoreCase: true },
      }),
    );

    const message = posted[0] as { result: { lineDiff: { summary: { unchanged: number } } } };
    expect(message.result.lineDiff.summary.unchanged).toBe(1);
  });

  it('feeds normalized text into the fine diff when ignore-options are active', () => {
    handleMessage(
      messageEvent('job-5', {
        left: 'Hello',
        right: 'hello',
        granularity: 'char',
        mode: 'text',
        ignoreOptions: { ...NO_IGNORE_OPTIONS, ignoreCase: true },
      }),
    );

    const message = posted[0] as { result: { fineDiff?: { segments: { type: string }[] } } };
    expect(message.result.fineDiff?.segments.every((s) => s.type === 'equal')).toBe(true);
  });

  it('computes a semantic JSON diff', () => {
    handleMessage(
      messageEvent('job-6', {
        left: '{"a":1}',
        right: '{"a":2}',
        granularity: 'line',
        mode: 'semantic-json',
        ignoreOptions: NO_IGNORE_OPTIONS,
      }),
    );

    const message = posted[0] as { result: { semanticDiff?: { ok: boolean; result?: { entries: unknown[] } } } };
    expect(message.result.semanticDiff).toEqual({ ok: true, result: { entries: [{ path: '/a', op: 'replace', oldValue: 1, newValue: 2 }], summary: { added: 0, removed: 0, changed: 1 } } });
  });

  it('computes a semantic YAML diff', () => {
    handleMessage(
      messageEvent('job-7', {
        left: 'a: 1\n',
        right: 'a: 2\n',
        granularity: 'line',
        mode: 'semantic-yaml',
        ignoreOptions: NO_IGNORE_OPTIONS,
      }),
    );

    const message = posted[0] as { result: { semanticDiff?: { ok: boolean } } };
    expect(message.result.semanticDiff?.ok).toBe(true);
  });

  it('computes a semantic XML diff', () => {
    handleMessage(
      messageEvent('job-8', {
        left: '<root><a>1</a></root>',
        right: '<root><a>2</a></root>',
        granularity: 'line',
        mode: 'semantic-xml',
        ignoreOptions: NO_IGNORE_OPTIONS,
      }),
    );

    const message = posted[0] as { result: { semanticDiff?: { ok: boolean } } };
    expect(message.result.semanticDiff?.ok).toBe(true);
  });

  it('returns a semantic-diff error (not a thrown exception) for malformed input, while the line diff still fills in as a fallback', () => {
    handleMessage(
      messageEvent('job-9', {
        left: '{not json',
        right: '{"a":1}',
        granularity: 'line',
        mode: 'semantic-json',
        ignoreOptions: NO_IGNORE_OPTIONS,
      }),
    );

    const message = posted[0] as { result: { lineDiff: unknown; semanticDiff?: { ok: boolean; error?: string } } };
    expect(message.result.semanticDiff?.ok).toBe(false);
    expect(message.result.semanticDiff?.error).toContain('Left input is not valid JSON');
    expect(message.result.lineDiff).toBeDefined();
  });

  it('omits semanticDiff entirely in text mode', () => {
    handleMessage(messageEvent('job-10', { left: 'a', right: 'b', granularity: 'line', mode: 'text', ignoreOptions: NO_IGNORE_OPTIONS }));

    const message = posted[0] as { result: { semanticDiff?: unknown } };
    expect(message.result.semanticDiff).toBeUndefined();
  });
});
