import { sanitizeAppearance } from '@dude/domain/core/appearance/appearance.model';
import type { AppearancePrefs } from '@dude/domain/core/appearance/appearance.model';
import type { HistoryEntry } from '@dude/domain/core/history/history.model';
import { HISTORY_ENTRY_SCHEMA_VERSION } from '@dude/domain/core/history/history.model';
import { MAX_NATIVE_RECENTS } from '@dude/domain/core/native-recents/native-recent.model';
import type { NativeRecentEntry, NativeRecentsStore } from '@dude/domain/core/native-recents/native-recent.model';
import { USAGE_STORE_SCHEMA_VERSION, sanitizeBuckets } from '@dude/domain/core/usage/usage.model';
import type { UsageStore } from '@dude/domain/core/usage/usage.model';
import { parseLocalDay } from '@dude/domain/core/usage/local-day';
import type { ScratchpadStore, WorkspaceSnippet } from '@dude/domain/core/workspace/scratchpad.model';
import { sanitizePreferenceOverrides, withPreferenceOverrides } from '@dude/domain/core/workspace/workspace.model';
import type { WorkspaceLayout } from '@dude/domain/core/workspace/workspace.model';
import type { EntityCodec } from './entity-codec.js';
import { isNonEmptyString, isRecord, optionalString, sanitizePanelTree, stringArray } from './codec-helpers.js';

/** Fixed id for single-document entities. */
export const DOCUMENT_ID = 'default';

export const appearanceCodec: EntityCodec<AppearancePrefs> = {
  entityType: 'appearance',
  schemaVersion: 1,
  scope: 'environment',
  sensitivity: 'non-sensitive',
  journaled: true,
  idOf: () => DOCUMENT_ID,
  decode: (raw) => (isRecord(raw) ? sanitizeAppearance(raw) : null),
  encode: (prefs) => ({ ...prefs }),
};

export const usageCodec: EntityCodec<UsageStore> = {
  entityType: 'usage',
  schemaVersion: USAGE_STORE_SCHEMA_VERSION,
  scope: 'environment',
  sensitivity: 'non-sensitive',
  journaled: true,
  /** Per-device (Phase 31D): the record id is its owning device's id; web standalone has none and keeps 'default'. */
  idOf: (store) => store.deviceId ?? DOCUMENT_ID,
  /** v1 documents upgrade to v2; a newer schema keeps its v1 fields (best-effort). */
  decode(raw) {
    if (!isRecord(raw) || !isRecord(raw['counts']) || !Array.isArray(raw['recentLog'])) return null;
    const version = raw['schemaVersion'];
    if (typeof version !== 'number' || version < 1) return null;

    const counts: Record<string, UsageStore['counts'][string]> = {};
    for (const [toolId, entry] of Object.entries(raw['counts'])) {
      if (isRecord(entry) && typeof entry['count'] === 'number' && Number.isFinite(entry['count']) && typeof entry['lastUsedAt'] === 'string') {
        counts[toolId] = { count: entry['count'], lastUsedAt: entry['lastUsedAt'] };
      }
    }
    const recentLog = raw['recentLog']
      .filter((e): e is Record<string, unknown> => isRecord(e) && typeof e['toolId'] === 'string' && typeof e['at'] === 'string')
      .map((e) => ({ toolId: e['toolId'] as string, at: e['at'] as string }));

    const owner = isNonEmptyString(raw['deviceId']) ? { deviceId: raw['deviceId'] } : {};
    if (version !== USAGE_STORE_SCHEMA_VERSION) {
      return { schemaVersion: 2, counts, recentLog, dailyBuckets: [], trackingStartedOn: null, ...owner };
    }
    const dailyBuckets = sanitizeBuckets(raw['dailyBuckets']);
    const start = raw['trackingStartedOn'];
    const trackingStartedOn = typeof start === 'string' && parseLocalDay(start) !== null ? start : (dailyBuckets[0]?.date ?? null);
    return { schemaVersion: 2, counts, recentLog, dailyBuckets, trackingStartedOn, ...owner };
  },
  encode: (store) => ({ ...store }),
};

export const workspaceLayoutCodec: EntityCodec<WorkspaceLayout> = {
  entityType: 'workspace-layout',
  schemaVersion: 1,
  scope: 'workspace',
  sensitivity: 'non-sensitive',
  journaled: false,
  idOf: () => DOCUMENT_ID,
  /** Unknown-tool pruning (`pruneUnknownTools`) stays caller-side: it needs the live registry. */
  decode(raw) {
    if (!isRecord(raw) || raw['schemaVersion'] !== 1 || !Array.isArray(raw['openTabs'])) return null;
    const focused = raw['focusedNodeId'];
    return {
      schemaVersion: 1,
      openTabs: stringArray(raw['openTabs']),
      panelTree: sanitizePanelTree(raw['panelTree']),
      focusedNodeId: typeof focused === 'string' ? focused : null,
      ...withPreferenceOverrides(sanitizePreferenceOverrides(raw['preferenceOverrides'])),
    };
  },
  encode: (layout) => ({ ...layout }),
};

function sanitizeSnippet(raw: unknown): WorkspaceSnippet | null {
  if (!isRecord(raw)) return null;
  const { id, title, body, createdAt } = raw;
  if (!isNonEmptyString(id) || typeof title !== 'string' || typeof body !== 'string' || typeof createdAt !== 'string') return null;
  return { id, title, body, ...optionalString('sourceToolId', raw['sourceToolId']), createdAt };
}

export const scratchpadCodec: EntityCodec<ScratchpadStore> = {
  entityType: 'scratchpad',
  schemaVersion: 1,
  scope: 'workspace',
  sensitivity: 'sensitive',
  journaled: false,
  idOf: () => DOCUMENT_ID,
  decode(raw) {
    if (!isRecord(raw) || raw['schemaVersion'] !== 1 || !Array.isArray(raw['snippets'])) return null;
    return {
      schemaVersion: 1,
      snippets: raw['snippets'].map(sanitizeSnippet).filter((s): s is WorkspaceSnippet => s !== null),
      drawerExpanded: raw['drawerExpanded'] === true,
    };
  },
  encode: (store) => ({ ...store }),
};

function sanitizeRecent(raw: unknown): NativeRecentEntry | null {
  if (!isRecord(raw)) return null;
  const { path, name, extension, openedAt } = raw;
  if (!isNonEmptyString(path) || typeof name !== 'string' || typeof extension !== 'string' || typeof openedAt !== 'string') return null;
  return { path, name, extension, openedAt };
}

export const nativeRecentsCodec: EntityCodec<NativeRecentsStore> = {
  entityType: 'native-recents',
  schemaVersion: 1,
  scope: 'device',
  sensitivity: 'sensitive',
  journaled: false,
  idOf: () => DOCUMENT_ID,
  decode(raw) {
    if (!isRecord(raw) || raw['schemaVersion'] !== 1 || !Array.isArray(raw['entries'])) return null;
    const entries = raw['entries'].map(sanitizeRecent).filter((e): e is NativeRecentEntry => e !== null);
    return { schemaVersion: 1, entries: entries.slice(0, MAX_NATIVE_RECENTS) };
  },
  encode: (store) => ({ ...store }),
};

export const historyEntryCodec: EntityCodec<HistoryEntry> = {
  entityType: 'history-entry',
  schemaVersion: HISTORY_ENTRY_SCHEMA_VERSION,
  scope: 'local-only',
  sensitivity: 'sensitive',
  journaled: false,
  idOf: (entry) => entry.id,
  decode(raw) {
    if (!isRecord(raw) || raw['schemaVersion'] !== HISTORY_ENTRY_SCHEMA_VERSION) return null;
    const { id, toolId, createdAt, summary } = raw;
    if (!isNonEmptyString(id) || typeof toolId !== 'string' || typeof createdAt !== 'string' || typeof summary !== 'string') return null;
    return {
      id,
      schemaVersion: 1,
      toolId,
      createdAt,
      summary,
      state: isRecord(raw['state']) ? raw['state'] : {},
      ...(raw['truncated'] === true ? { truncated: true } : {}),
    };
  },
  encode: (entry) => ({ ...entry }),
};
