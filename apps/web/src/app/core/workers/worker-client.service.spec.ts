import { TestBed } from '@angular/core/testing';
import { WorkerClientService } from './worker-client.service';
import { WorkerJob } from './worker-job';
import { WorkerRequestMessage } from "@dude/tool-engine/core/workers/worker-protocol";

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  readonly posted: WorkerRequestMessage<unknown>[] = [];
  readonly transfers: Transferable[][] = [];

  postMessage(data: WorkerRequestMessage<unknown>, transfer: Transferable[] = []): void {
    this.posted.push(data);
    this.transfers.push(transfer);
  }

  terminate(): void {
    this.terminated = true;
  }

  emit(data: unknown): void {
    this.onmessage?.({ data } as MessageEvent);
  }

  emitError(message: string): { preventDefault: ReturnType<typeof vi.fn> } {
    const preventDefault = vi.fn();
    this.onerror?.({ message, preventDefault } as unknown as ErrorEvent);
    return { preventDefault };
  }
}

describe('WorkerClientService', () => {
  let service: WorkerClientService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WorkerClientService);
  });

  it('resolves the job with the result and terminates the worker', () => {
    const worker = new FakeWorker();
    const job: WorkerJob<number> = service.run(() => worker as unknown as Worker, { n: 2 });

    expect(job.status()).toBe('running');
    const id = worker.posted[0].id;
    worker.emit({ id, kind: 'result', result: 42 });

    expect(job.status()).toBe('done');
    expect(job.result()).toBe(42);
    expect(worker.terminated).toBe(true);
  });

  it('updates progress without changing status', () => {
    const worker = new FakeWorker();
    const job: WorkerJob<number> = service.run(() => worker as unknown as Worker, {});
    const id = worker.posted[0].id;

    worker.emit({ id, kind: 'progress', progress: 40 });

    expect(job.progress()).toBe(40);
    expect(job.status()).toBe('running');
  });

  it('moves to error status and terminates the worker on an error message', () => {
    const worker = new FakeWorker();
    const job: WorkerJob<number> = service.run(() => worker as unknown as Worker, {});
    const id = worker.posted[0].id;

    worker.emit({ id, kind: 'error', error: { message: 'boom' } });

    expect(job.status()).toBe('error');
    expect(job.error()).toBe('boom');
    expect(worker.terminated).toBe(true);
  });

  it("converts worker.onerror into a job error without letting it propagate", () => {
    const worker = new FakeWorker();
    const job: WorkerJob<number> = service.run(() => worker as unknown as Worker, {});

    const { preventDefault } = worker.emitError('script crashed');

    expect(preventDefault).toHaveBeenCalled();
    expect(job.status()).toBe('error');
    expect(job.error()).toBe('script crashed');
    expect(worker.terminated).toBe(true);
  });

  it('cancel() terminates the worker immediately and ignores later messages', () => {
    const worker = new FakeWorker();
    const job: WorkerJob<number> = service.run(() => worker as unknown as Worker, {});
    const id = worker.posted[0].id;

    job.cancel();
    expect(job.status()).toBe('cancelled');
    expect(worker.terminated).toBe(true);

    worker.emit({ id, kind: 'result', result: 99 });
    expect(job.status()).toBe('cancelled');
    expect(job.result()).toBeNull();
  });

  it('ignores messages carrying a different job id', () => {
    const worker = new FakeWorker();
    const job: WorkerJob<number> = service.run(() => worker as unknown as Worker, {});

    worker.emit({ id: 'some-other-job', kind: 'result', result: 1 });

    expect(job.status()).toBe('running');
    expect(job.result()).toBeNull();
  });

  it('passes a transfer list through to postMessage when provided', () => {
    const worker = new FakeWorker();
    const buffer = new ArrayBuffer(8);
    service.run(() => worker as unknown as Worker, { buffer }, [buffer]);

    expect(worker.transfers[0]).toEqual([buffer]);
  });

  it('defaults to an empty transfer list when none is provided', () => {
    const worker = new FakeWorker();
    service.run(() => worker as unknown as Worker, {});

    expect(worker.transfers[0]).toEqual([]);
  });

  it('turns a synchronous worker-construction failure into a job error instead of throwing', () => {
    let job: WorkerJob<number> | undefined;

    expect(() => {
      job = service.run<unknown, number>(() => {
        throw new Error('workers unsupported');
      }, {});
    }).not.toThrow();

    expect(job!.status()).toBe('error');
    expect(job!.error()).toBe('workers unsupported');
  });
});

describe('WorkerClientService.runAsync', () => {
  let service: WorkerClientService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(WorkerClientService);
  });

  it('resolves with the worker result', async () => {
    const worker = new FakeWorker();
    const promise = service.runAsync<{ n: number }, number>(() => worker as unknown as Worker, { n: 2 });
    worker.emit({ id: worker.posted[0].id, kind: 'result', result: 4 });
    await expect(promise).resolves.toBe(4);
    expect(worker.terminated).toBe(true);
  });

  it('rejects with the worker error message', async () => {
    const worker = new FakeWorker();
    const promise = service.runAsync(() => worker as unknown as Worker, {});
    worker.emit({ id: worker.posted[0].id, kind: 'error', error: { message: 'bad input' } });
    await expect(promise).rejects.toThrow('bad input');
  });

  it('terminates the worker and rejects with AbortError when the signal aborts', async () => {
    const worker = new FakeWorker();
    const abort = new AbortController();
    const promise = service.runAsync(() => worker as unknown as Worker, {}, abort.signal);
    abort.abort();
    await expect(promise).rejects.toMatchObject({ name: 'AbortError' });
    expect(worker.terminated).toBe(true);
  });

  it('never spawns a worker for an already-aborted signal', async () => {
    const create = vi.fn();
    const abort = new AbortController();
    abort.abort();
    await expect(service.runAsync(create, {}, abort.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(create).not.toHaveBeenCalled();
  });
});
