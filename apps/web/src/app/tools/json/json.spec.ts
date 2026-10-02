import { ApplicationRef, Signal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Json } from './json';
import { WorkerClientService } from '../../core/workers/worker-client.service';
import { WorkerJob, WorkerJobStatus } from '../../core/workers/worker-job';

class FakeWorkerJob<T> implements WorkerJob<T> {
  readonly status: Signal<WorkerJobStatus> = signal<WorkerJobStatus>('running');
  readonly progress: Signal<number | null> = signal<number | null>(null);
  readonly result: Signal<T | null> = signal<T | null>(null);
  readonly error: Signal<string | null> = signal<string | null>(null);
  readonly cancel = vi.fn();
}

class FakeWorkerClientService {
  readonly jobs: FakeWorkerJob<unknown>[] = [];
  readonly run = vi.fn((_createWorker: () => Worker, _payload: unknown): WorkerJob<unknown> => {
    const job = new FakeWorkerJob<unknown>();
    this.jobs.push(job);
    return job;
  });
}

describe('Json component — execution threshold', () => {
  let fakeWorkerClient: FakeWorkerClientService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    fakeWorkerClient = new FakeWorkerClientService();

    TestBed.configureTestingModule({
      providers: [{ provide: WorkerClientService, useValue: fakeWorkerClient }],
    });
  });

  async function stable(): Promise<void> {
    await TestBed.inject(ApplicationRef).whenStable();
  }

  function setInput(fixture: ComponentFixture<Json>, value: string): void {
    const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
    textarea.value = value;
    textarea.dispatchEvent(new Event('input'));
  }

  it('stays on the main thread for input at exactly the 50,000-char threshold', async () => {
    const fixture = TestBed.createComponent(Json);
    fixture.detectChanges();

    setInput(fixture, '1'.repeat(50_000));
    fixture.detectChanges();
    await stable();

    expect(fakeWorkerClient.run).not.toHaveBeenCalled();
  });

  it('dispatches to a worker for input one character past the threshold', async () => {
    const fixture = TestBed.createComponent(Json);
    fixture.detectChanges();

    setInput(fixture, '1'.repeat(50_001));
    fixture.detectChanges();
    await stable();

    expect(fakeWorkerClient.run).toHaveBeenCalledTimes(1);
    const payload = fakeWorkerClient.run.mock.calls[0][1] as { input: string; mode: string; indent: number };
    expect(payload.input).toHaveLength(50_001);
    expect(payload.mode).toBe('pretty');
    expect(payload.indent).toBe(2);
  });

  it('cancels the in-flight job when input shrinks back below the threshold', async () => {
    const fixture = TestBed.createComponent(Json);
    fixture.detectChanges();

    setInput(fixture, '1'.repeat(50_001));
    fixture.detectChanges();
    await stable();

    expect(fakeWorkerClient.jobs).toHaveLength(1);
    const job = fakeWorkerClient.jobs[0];

    setInput(fixture, '1'.repeat(50_000));
    fixture.detectChanges();
    await stable();

    expect(job.cancel).toHaveBeenCalled();
  });
});
