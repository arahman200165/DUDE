/**
 * Watched Folders & Change Timeline shapes (Phase 29 items 10 and 13, Milestone 534), shared by the
 * main-process watch service, the renderer mirror, and the tool.
 */

export type ChangeKind = 'created' | 'modified' | 'deleted' | 'renamed' | 'gap' | 'dude';

export interface ChangeEvent {
  readonly seq: number;
  readonly at: string;
  readonly kind: ChangeKind;
  /** Posix path relative to the watched folder ('' for folder-level events such as a gap). */
  readonly path: string;
  readonly from?: string;
  readonly size?: number;
  readonly sizeDelta?: number;
  readonly isDir?: boolean;
  /** SHA-256 of captured content before/after the change (content capture on). */
  readonly before?: string;
  readonly after?: string;
  /** DUDE's own batch operation that caused the change (never notified). */
  readonly planId?: string;
  readonly count?: number;
  readonly message?: string;
}

export interface WatchedFolder {
  readonly id: string;
  readonly path: string;
  readonly label: string;
  readonly enabled: boolean;
  readonly notify: boolean;
  readonly captureContent: boolean;
  /** Extra excluded names/globs on top of the default excludes. */
  readonly exclude: readonly string[];
  readonly addedAt: string;
}

export interface WatchedFolderStatus extends WatchedFolder {
  readonly active: boolean;
  readonly available: boolean;
  readonly events: number;
  readonly lastEventAt?: string;
  readonly contentBytes: number;
  readonly error?: string;
}

export interface FolderWatchSettings {
  readonly enabled: boolean;
  /** Minimum minutes between notifications for one folder. */
  readonly notifyEveryMinutes: number;
}

export interface FolderWatchState {
  readonly settings: FolderWatchSettings;
  readonly folders: readonly WatchedFolderStatus[];
}

export interface TimelineQuery {
  readonly folderId: string;
  readonly kinds?: readonly ChangeKind[];
  readonly text?: string;
  readonly limit?: number;
  readonly beforeSeq?: number;
}
