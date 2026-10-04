import { InjectionToken } from '@angular/core';
import type { HubClient } from '@dude/api-client';
import type { SyncCategory, SyncRecord } from '@dude/contracts/hub';
import type { RecordBook } from '@dude/sync';
import type { HubWebEngine } from './hub-web-engine';

/** The slice of the shared Hub client the browser sync uses (type only: the client itself is never imported statically). */
export type HubWebClient = Pick<HubClient, 'webAttach' | 'webSnapshot' | 'webChanges' | 'webPush' | 'webState' | 'webAccessGet' | 'webAccessSet'>;

export type HubWebAccess = Readonly<Record<SyncCategory, boolean>>;

/**
 * What `main.ts` learned from the Hub before bootstrap on the Hub-served web build (PD-051/PD-053). Null on every other
 * host, so Pages and desktop never see any of this.
 */
export interface HubWebBoot {
  readonly engine: HubWebEngine;
  readonly deviceId: string;
  /** Web access per category at attach time; a category that is off keeps its data origin-local. */
  readonly access: HubWebAccess;
  /** `asOfRevision` of the first snapshot page: the point `webChanges` continues from. */
  readonly cursor: number;
  readonly floor: number;
  readonly retentionDays: number;
  /** Snapshot records of the categories the browser may read. */
  readonly records: readonly SyncRecord[];
  readonly book: RecordBook;
}

export const HUB_WEB_BOOT = new InjectionToken<HubWebBoot | null>('DUDE Hub web boot', { providedIn: 'root', factory: () => null });

export type HubWebErrorKind = 'unauthorized' | 'cursor-expired' | 'not-attached' | 'incompatible' | 'unreachable' | 'rejected';

/** Classifies an api-client failure by shape, so this file needs no runtime import of the client. */
export function classifyHubError(error: unknown): { kind: HubWebErrorKind; message: string } {
  const e = error as { name?: unknown; status?: unknown; code?: unknown; message?: unknown } | null;
  const message = typeof e?.message === 'string' ? e.message : 'The Hub could not be reached.';
  if (e?.name === 'HubApiError' && typeof e.status === 'number') {
    if (e.status === 401) return { kind: 'unauthorized', message };
    if (e.status === 410 || e.code === 'cursor-expired') return { kind: 'cursor-expired', message };
    if (e.status === 409 && e.code === 'not-attached') return { kind: 'not-attached', message };
    if (e.status === 426 || e.code === 'unsupported-protocol') return { kind: 'incompatible', message };
    if (e.status >= 500 || e.status === 429) return { kind: 'unreachable', message };
    return { kind: 'rejected', message };
  }
  if (e?.name === 'HubProtocolError') {
    // A 5xx without a Hub error envelope is not the Hub speaking: the service worker answers 504 when the network is down,
    // and a proxy in front of a stopped Hub answers 502/503/504. Only a malformed answer of a healthy status is a version mismatch.
    return typeof e.status === 'number' && e.status >= 500 ? { kind: 'unreachable', message } : { kind: 'incompatible', message };
  }
  return { kind: 'unreachable', message };
}
