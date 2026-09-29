import { Signal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AdvancedDiff } from './advanced-diff';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob, WorkerJobStatus } from '../../core/workers/worker-job';
import { AdvancedDiffResult } from './advanced-diff-result';
import { NO_IGNORE_OPTIONS } from './diff-normalize';

class FakeWorkerJob implements WorkerJob<AdvancedDiffResult> {
  readonly status: Signal<WorkerJobStatus> = signal<WorkerJobStatus>('running');
  private readonly resultSignal = signal<AdvancedDiffResult | null>(null);
  readonly result: Signal<AdvancedDiffResult | null> = this.resultSignal;
  readonly progress: Signal<number | null> = signal<number | null>(null);
  readonly error: Signal<string | null> = signal<string | null>(null);
  readonly cancel = vi.fn();

  resolve(result: AdvancedDiffResult): void {
    this.resultSignal.set(result);
  }
}

class FakeWorkerClientService {
  readonly jobs: FakeWorkerJob[] = [];
  readonly run = vi.fn((_createWorker: () => Worker, _payload: unknown): WorkerJob<AdvancedDiffResult> => {
    const job = new FakeWorkerJob();
    this.jobs.push(job);
    return job;
  });
}

describe('AdvancedDiff component', () => {
  let fakeWorkerClient: FakeWorkerClientService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    fakeWorkerClient = new FakeWorkerClientService();

    TestBed.configureTestingModule({
      providers: [{ provide: WorkerClientService, useValue: fakeWorkerClient }],
    });
  });

  it('dispatches a worker job with the current left/right text and granularity on run()', () => {
    const fixture = TestBed.createComponent(AdvancedDiff);
    fixture.componentInstance['left'].set('a\nb');
    fixture.componentInstance['right'].set('a\nc');
    fixture.componentInstance['granularity'].set('word');
    fixture.detectChanges();

    fixture.componentInstance['run']();

    expect(fakeWorkerClient.run).toHaveBeenCalledTimes(1);
    const payload = fakeWorkerClient.run.mock.calls[0][1] as { left: string; right: string; granularity: string };
    expect(payload).toEqual({ left: 'a\nb', right: 'a\nc', mode: 'text', granularity: 'word', ignoreOptions: NO_IGNORE_OPTIONS });
  });

  it('builds hunks and a merged output from the job result, honoring accepted decisions', () => {
    const fixture = TestBed.createComponent(AdvancedDiff);
    fixture.detectChanges();

    fixture.componentInstance['run']();
    const job = fakeWorkerClient.jobs[0];
    job.resolve({
      lineDiff: {
        lines: [
          { type: 'equal', text: 'one' },
          { type: 'remove', text: 'two' },
          { type: 'add', text: 'TWO' },
          { type: 'equal', text: 'three' },
        ],
        summary: { added: 1, removed: 1, unchanged: 2 },
      },
    });
    fixture.detectChanges();

    expect(fixture.componentInstance['hunks']()).toHaveLength(1);
    expect(fixture.componentInstance['mergedOutput']()).toBe('one\n<<<<<<< left\ntwo\n=======\nTWO\n>>>>>>> right\nthree');

    fixture.componentInstance['acceptHunk'](0, 'right');
    fixture.detectChanges();

    expect(fixture.componentInstance['mergedOutput']()).toBe('one\nTWO\nthree');
    expect(fixture.componentInstance['resolvedCount']()).toBe(1);
  });

  it('renders +/- gutter markers and underline/strike segment decoration without relying on color', () => {
    const fixture = TestBed.createComponent(AdvancedDiff);
    fixture.detectChanges();
    fixture.componentInstance['run']();
    fakeWorkerClient.jobs[0].resolve({
      lineDiff: {
        lines: [
          { type: 'equal', text: 'one' },
          { type: 'remove', text: 'two' },
          { type: 'add', text: 'TWO' },
        ],
        summary: { added: 1, removed: 1, unchanged: 1 },
      },
      fineDiff: {
        segments: [
          { type: 'remove', text: 'two' },
          { type: 'add', text: 'TWO' },
        ],
        summary: { addedChars: 3, removedChars: 3 },
      },
    });
    fixture.detectChanges();

    const root = fixture.nativeElement as HTMLElement;
    const gutters = (type: string) => root.querySelector(`[data-line="${type}"] [data-gutter]`);
    expect(gutters('add')?.textContent?.trim()).toBe('+');
    expect(gutters('remove')?.textContent?.trim()).toBe('−');
    expect(gutters('add')?.getAttribute('aria-hidden')).toBe('true');
    expect(root.querySelector('[data-line="add"]')?.textContent).toContain('TWO');

    fixture.componentInstance['granularity'].set('word');
    fixture.detectChanges();
    expect(fixture.componentInstance['segmentClasses']('add')).toContain('underline');
    expect(fixture.componentInstance['segmentClasses']('remove')).toContain('line-through');
  });

  it('cancels the in-flight job and resets state on clear()', () => {
    const fixture = TestBed.createComponent(AdvancedDiff);
    fixture.componentInstance['left'].set('a');
    fixture.componentInstance['right'].set('b');
    fixture.detectChanges();

    fixture.componentInstance['run']();
    const job = fakeWorkerClient.jobs[0];

    fixture.componentInstance['clear']();

    expect(job.cancel).toHaveBeenCalled();
    expect(fixture.componentInstance['left']()).toBe('');
    expect(fixture.componentInstance['right']()).toBe('');
    expect(fixture.componentInstance['job']()).toBeNull();
  });

  it('dispatches an image worker job with array-buffer payloads on runImageDiff()', async () => {
    const fixture = TestBed.createComponent(AdvancedDiff);
    const leftFile = new File([new Uint8Array([1, 2, 3])], 'left.png', { type: 'image/png' });
    const rightFile = new File([new Uint8Array([4, 5, 6])], 'right.png', { type: 'image/png' });
    fixture.componentInstance['onLeftImageSelected'](leftFile);
    fixture.componentInstance['onRightImageSelected'](rightFile);
    fixture.detectChanges();

    await fixture.componentInstance['runImageDiff']();

    expect(fakeWorkerClient.run).toHaveBeenCalledTimes(1);
    const payload = fakeWorkerClient.run.mock.calls[0][1] as { left: ArrayBuffer; right: ArrayBuffer; threshold: number };
    expect(payload.threshold).toBe(0.1);
    expect(new Uint8Array(payload.left)).toEqual(new Uint8Array([1, 2, 3]));
    expect(new Uint8Array(payload.right)).toEqual(new Uint8Array([4, 5, 6]));
  });

  it('does not dispatch an image job while either image is missing', async () => {
    const fixture = TestBed.createComponent(AdvancedDiff);
    fixture.detectChanges();

    await fixture.componentInstance['runImageDiff']();

    expect(fakeWorkerClient.run).not.toHaveBeenCalled();
  });

  it('clear() also resets image-mode state', async () => {
    const fixture = TestBed.createComponent(AdvancedDiff);
    const leftFile = new File([new Uint8Array([1])], 'left.png', { type: 'image/png' });
    const rightFile = new File([new Uint8Array([2])], 'right.png', { type: 'image/png' });
    fixture.componentInstance['onLeftImageSelected'](leftFile);
    fixture.componentInstance['onRightImageSelected'](rightFile);
    fixture.detectChanges();
    await fixture.componentInstance['runImageDiff']();
    const imageJob = fakeWorkerClient.jobs[0];

    fixture.componentInstance['clear']();

    expect(imageJob.cancel).toHaveBeenCalled();
    expect(fixture.componentInstance['leftImageFile']()).toBeNull();
    expect(fixture.componentInstance['rightImageFile']()).toBeNull();
    expect(fixture.componentInstance['imageJob']()).toBeNull();
  });

  it('switching input mode does not clear already-loaded text', () => {
    const fixture = TestBed.createComponent(AdvancedDiff);
    fixture.componentInstance['left'].set('loaded from file');
    fixture.detectChanges();

    fixture.componentInstance['setInputMode']('file');
    fixture.detectChanges();
    fixture.componentInstance['setInputMode']('paste');
    fixture.detectChanges();

    expect(fixture.componentInstance['left']()).toBe('loaded from file');
  });
});
