import { ApplicationRef, Signal, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FileBase64 } from './file-base64';
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

async function stable(): Promise<void> {
  await TestBed.inject(ApplicationRef).whenStable();
}

function setDecodeInput(fixture: ComponentFixture<FileBase64>, value: string): void {
  const textarea: HTMLTextAreaElement = fixture.nativeElement.querySelector('textarea');
  textarea.value = value;
  textarea.dispatchEvent(new Event('input'));
}

describe('FileBase64 component', () => {
  let fakeWorkerClient: FakeWorkerClientService;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    fakeWorkerClient = new FakeWorkerClientService();

    TestBed.configureTestingModule({
      providers: [{ provide: WorkerClientService, useValue: fakeWorkerClient }],
    });
  });

  it('stays on the main thread for a small encoded file', async () => {
    const fixture = TestBed.createComponent(FileBase64);
    fixture.detectChanges();

    const file = new File([new Uint8Array([1, 2, 3])], 'small.bin');
    await fixture.componentInstance['onFileSelected'](file);
    fixture.detectChanges();
    await stable();

    expect(fakeWorkerClient.run).not.toHaveBeenCalled();
    expect(fixture.componentInstance['base64Output']()).not.toBe('');
  });

  it('dispatches an encode job to a worker for a file past the threshold', async () => {
    const fixture = TestBed.createComponent(FileBase64);
    fixture.detectChanges();

    const bigBytes = new Uint8Array(2_000_001);
    const file = new File([bigBytes], 'big.bin');
    await fixture.componentInstance['onFileSelected'](file);
    fixture.detectChanges();
    await stable();

    expect(fakeWorkerClient.run).toHaveBeenCalledTimes(1);
    const payload = fakeWorkerClient.run.mock.calls[0][1] as { direction: string; buffer: ArrayBuffer };
    expect(payload.direction).toBe('encode');
    expect(payload.buffer.byteLength).toBe(2_000_001);
  });

  it('decodes on the main thread for pasted Base64 at the threshold', async () => {
    const fixture = TestBed.createComponent(FileBase64);
    fixture.componentInstance['direction'].set('decode');
    fixture.detectChanges();

    setDecodeInput(fixture, btoa('hello'));
    fixture.detectChanges();
    await stable();

    expect(fakeWorkerClient.run).not.toHaveBeenCalled();
    expect(fixture.componentInstance['decodeResult']()).toEqual({ ok: true, bytes: expect.any(Uint8Array) });
  });

  it('dispatches a decode job to a worker for pasted Base64 past the threshold', async () => {
    const fixture = TestBed.createComponent(FileBase64);
    fixture.componentInstance['direction'].set('decode');
    fixture.detectChanges();

    setDecodeInput(fixture, '1'.repeat(2_000_001));
    fixture.detectChanges();
    await stable();

    expect(fakeWorkerClient.run).toHaveBeenCalledTimes(1);
    const payload = fakeWorkerClient.run.mock.calls[0][1] as { direction: string; base64: string };
    expect(payload.direction).toBe('decode');
  });

  it('cancels any in-flight job and resets state on clear()', async () => {
    const fixture = TestBed.createComponent(FileBase64);
    fixture.componentInstance['direction'].set('decode');
    fixture.detectChanges();

    setDecodeInput(fixture, '1'.repeat(2_000_001));
    fixture.detectChanges();
    await stable();

    const job = fakeWorkerClient.jobs[0];
    fixture.componentInstance['clear']();

    expect(job.cancel).toHaveBeenCalled();
    expect(fixture.componentInstance['base64Input']()).toBe('');
    expect(fixture.componentInstance['base64Output']()).toBe('');
  });
});
