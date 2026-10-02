import { inject as injectPlatformBridge } from '@angular/core';
import { PLATFORM_BRIDGE } from './platform-bridge.adapter';
import { Injectable, signal, type Signal } from '@angular/core';
import type { FsJobEvent, FsJobProgress, FsJobRequest, WalkIssue } from "@dude/contracts/fs/fs-types";

export type FsJobStatus = 'starting' | 'running' | 'done' | 'error' | 'cancelled';

/** A running fs utility-process job as signals plus a result promise (Phase 29, Milestone 523). */
export interface FsJobHandle<TResult> {
  readonly status: Signal<FsJobStatus>;
  readonly progress: Signal<FsJobProgress | null>;
  readonly issues: Signal<readonly WalkIssue[]>;
  readonly error: Signal<string>;
  readonly result: Promise<TResult>;
  cancel(): void;
}

const MAX_ISSUES = 500;

/**
 * Renderer client for `dude:fsjob:*` — the streamed, cancellable filesystem jobs every Phase 29
 * tool runs in the desktop fs utility process (drive-wide walks, bulk hashing, search, plan
 * building). Batches are handed to the caller's `onBatch` as they arrive instead of being
 * accumulated here, so a tool can aggregate a million-entry walk without holding every entry.
 */
@Injectable({ providedIn: 'root' })
export class FsJobService {
  private readonly platformBridgePort = injectPlatformBridge(PLATFORM_BRIDGE);

  private readonly listeners = new Map<string, (event: FsJobEvent) => void>();
  private readonly early = new Map<string, FsJobEvent[]>();
  private subscribed = false;

  get available(): boolean { return !!this.platformBridgePort.get()?.fsJobs; }

  private get bridge() {
    const jobs = this.platformBridgePort.get()?.fsJobs;
    if (!jobs) throw new Error('Native filesystem jobs are only available in the desktop app.');
    return jobs;
  }

  private subscribe(): void {
    if (this.subscribed) return;
    this.subscribed = true;
    this.bridge.onEvent((event) => {
      const listener = this.listeners.get(event.jobId);
      if (listener) listener(event);
      else this.early.set(event.jobId, [...(this.early.get(event.jobId) ?? []), event]);
    });
  }

  run<TResult = unknown, TItem = unknown>(request: FsJobRequest, onBatch?: (items: readonly TItem[]) => void): FsJobHandle<TResult> {
    const status = signal<FsJobStatus>('starting');
    const progress = signal<FsJobProgress | null>(null);
    const issues = signal<readonly WalkIssue[]>([]);
    const error = signal('');
    let jobId: string | null = null;
    let cancelRequested = false;
    let settle!: { resolve: (value: TResult) => void; reject: (reason: Error) => void };
    const result = new Promise<TResult>((resolve, reject) => { settle = { resolve, reject }; });
    // Callers that only watch the signals shouldn't trip an unhandled-rejection warning.
    result.catch(() => {});

    const handle = (event: FsJobEvent) => {
      switch (event.type) {
        case 'progress': progress.set(event.progress); break;
        case 'batch': onBatch?.(event.items as readonly TItem[]); break;
        case 'issues': issues.update((list) => [...list, ...event.issues].slice(0, MAX_ISSUES)); break;
        case 'result': status.set('done'); settle.resolve(event.data as TResult); break;
        case 'error':
          status.set(cancelRequested ? 'cancelled' : 'error');
          error.set(event.message);
          settle.reject(new Error(event.message));
          break;
        case 'done': if (jobId) this.listeners.delete(jobId); break;
      }
    };

    try {
      this.subscribe();
      void this.bridge.start(request).then((started) => {
        if (!started.ok) {
          status.set('error');
          error.set(started.error);
          settle.reject(new Error(started.error));
          return;
        }
        jobId = started.jobId;
        status.set('running');
        this.listeners.set(jobId, handle);
        for (const event of this.early.get(jobId) ?? []) handle(event);
        this.early.delete(jobId);
        if (cancelRequested) void this.bridge.cancel(jobId);
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught);
      status.set('error');
      error.set(message);
      settle.reject(new Error(message));
    }

    return {
      status,
      progress,
      issues,
      error,
      result,
      cancel: () => {
        cancelRequested = true;
        if (jobId) void this.bridge.cancel(jobId);
      },
    };
  }
}
