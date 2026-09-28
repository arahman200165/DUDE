import { TestBed } from '@angular/core/testing';
import type { FsJobEvent } from '../../../shared-logic/fs/fs-types';
import { fakeElectronBridge } from './testing/fake-electron-bridge';
import { installBridge, removeBridge } from './testing/recording-fs-bridge';
import { FsJobService } from './fs-job.service';

describe('FsJobService', () => {
  let emit: (event: FsJobEvent) => void;
  const cancel = vi.fn(async () => true);

  beforeEach(() => {
    cancel.mockClear();
    installBridge(fakeElectronBridge({
      fsJobs: { start: async () => ({ ok: true, jobId: 'j1' }), cancel, onEvent: (callback) => { emit = callback; return () => {}; } },
    }));
  });
  afterEach(() => removeBridge());

  it('streams batches to the caller, tracks progress and issues, and resolves with the result', async () => {
    const service = TestBed.inject(FsJobService);
    const batches: unknown[] = [];
    const job = service.run<{ total: number }>({ kind: 'walk', root: 'C:\\work' }, (items) => batches.push(...items));
    await Promise.resolve();
    await Promise.resolve();
    expect(job.status()).toBe('running');
    emit({ jobId: 'j1', type: 'batch', items: [1, 2] });
    emit({ jobId: 'j1', type: 'progress', progress: { scanned: 2, bytes: 10 } });
    emit({ jobId: 'j1', type: 'issues', issues: [{ path: 'x', code: 'EACCES', message: 'denied' }] });
    emit({ jobId: 'j1', type: 'result', data: { total: 2 } });
    emit({ jobId: 'j1', type: 'done' });
    expect(await job.result).toEqual({ total: 2 });
    expect(batches).toEqual([1, 2]);
    expect(job.progress()?.scanned).toBe(2);
    expect(job.issues()).toHaveLength(1);
    expect(job.status()).toBe('done');
  });

  it('marks a cancelled job as cancelled, not failed', async () => {
    const service = TestBed.inject(FsJobService);
    const job = service.run({ kind: 'walk', root: 'C:\\work' });
    job.cancel();
    await Promise.resolve();
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledWith('j1');
    emit({ jobId: 'j1', type: 'error', message: 'Cancelled.' });
    await expect(job.result).rejects.toThrow('Cancelled.');
    expect(job.status()).toBe('cancelled');
  });

  it('fails cleanly on the web, where there is no bridge', async () => {
    removeBridge();
    const job = TestBed.inject(FsJobService).run({ kind: 'walk', root: 'x' });
    await expect(job.result).rejects.toThrow(/desktop app/);
    expect(job.status()).toBe('error');
  });
});
