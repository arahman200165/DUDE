import { ApplicationRef, Signal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MarkdownWorkspace } from './markdown-workspace';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob, WorkerJobStatus } from '../../core/workers/worker-job';
import { WorkspaceRenderResult } from "@dude/tool-engine/tools/markdown-workspace/markdown-workspace-render";

class FakeWorkerJob implements WorkerJob<WorkspaceRenderResult> {
  readonly status: Signal<WorkerJobStatus> = signal<WorkerJobStatus>('running');
  private readonly resultSignal = signal<WorkspaceRenderResult | null>(null);
  readonly result: Signal<WorkspaceRenderResult | null> = this.resultSignal;
  readonly progress: Signal<number | null> = signal<number | null>(null);
  readonly error: Signal<string | null> = signal<string | null>(null);
  readonly cancel = vi.fn();

  resolve(result: WorkspaceRenderResult): void {
    this.resultSignal.set(result);
  }
}

class FakeWorkerClientService {
  readonly jobs: FakeWorkerJob[] = [];
  readonly run = vi.fn((_createWorker: () => Worker, _payload: unknown): WorkerJob<WorkspaceRenderResult> => {
    const job = new FakeWorkerJob();
    this.jobs.push(job);
    return job;
  });
}

async function stable(): Promise<void> {
  await TestBed.inject(ApplicationRef).whenStable();
}

function setSource(fixture: ComponentFixture<MarkdownWorkspace>, value: string): void {
  // Not the first `<textarea>` in the DOM — the custom-CSS `<details>` block
  // above the split-pane also renders one; select the source editor specifically.
  const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea[placeholder="Type Markdown here…"]');
  textarea.value = value;
  textarea.dispatchEvent(new Event('input'));
}

describe('MarkdownWorkspace component — execution threshold', () => {
  let fakeWorkerClient: FakeWorkerClientService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    fakeWorkerClient = new FakeWorkerClientService();

    TestBed.configureTestingModule({
      providers: [{ provide: WorkerClientService, useValue: fakeWorkerClient }],
    });
  });

  it('stays on the main thread for input at exactly the 100,000-char threshold', async () => {
    const fixture = TestBed.createComponent(MarkdownWorkspace);
    fixture.detectChanges();

    setSource(fixture, '1'.repeat(100_000));
    fixture.detectChanges();
    await stable();

    expect(fakeWorkerClient.run).not.toHaveBeenCalled();
  });

  it('dispatches to a worker for input one character past the threshold', async () => {
    const fixture = TestBed.createComponent(MarkdownWorkspace);
    fixture.detectChanges();

    setSource(fixture, '1'.repeat(100_001));
    fixture.detectChanges();
    await stable();

    expect(fakeWorkerClient.run).toHaveBeenCalledTimes(1);
  });

  it('sanitizes the worker-produced HTML just like the sync path, even though the worker cannot sanitize it itself', async () => {
    const fixture = TestBed.createComponent(MarkdownWorkspace);
    fixture.detectChanges();

    setSource(fixture, '1'.repeat(100_001));
    fixture.detectChanges();
    await stable();

    const job = fakeWorkerClient.jobs[0];
    job.resolve({
      renderedHtmlRaw: '<p>hi</p><script>alert(1)</script>',
      frontMatter: null,
      frontMatterError: null,
      toc: [],
      stats: { words: 1, characters: 2, charactersNoSpaces: 2, readingTimeMinutes: 1 },
    });
    fixture.detectChanges();

    const sanitized = fixture.componentInstance['sanitizedHtml']();
    expect(sanitized).toContain('hi');
    expect(sanitized).not.toContain('<script>');
  });

  it('cancels the in-flight job when input shrinks back below the threshold', async () => {
    const fixture = TestBed.createComponent(MarkdownWorkspace);
    fixture.detectChanges();

    setSource(fixture, '1'.repeat(100_001));
    fixture.detectChanges();
    await stable();

    const job = fakeWorkerClient.jobs[0];
    setSource(fixture, '1'.repeat(100_000));
    fixture.detectChanges();
    await stable();

    expect(job.cancel).toHaveBeenCalled();
  });
});
