/** Normalized sources shown by the Startup Programs tool (Milestone 605). */
export type StartupEntrySource = 'registry-run' | 'startup-folder' | 'scheduled-task' | 'service';
export type StartupEntryState = 'enabled' | 'disabled' | 'unknown';

export interface StartupEntry {
  readonly id: string;
  readonly source: StartupEntrySource;
  readonly name: string;
  readonly command: string;
  readonly targetPath: string | null;
  readonly exists: boolean | null;
  readonly publisher: string | null;
  readonly signature: 'signed' | 'catalog-signed' | 'unsigned' | 'invalid' | null;
  readonly state: StartupEntryState;
  readonly scope: 'user' | 'machine' | 'common' | 'task' | 'service';
  readonly detail?: string;
  /** Present for Run and StartupFolder entries when the approval key was readable, including missing values. */
  readonly approved?: StartupApprovedRef;
  /** Scheduled-task reference, for linking to the Scheduled Tasks tool. */
  readonly task?: { readonly taskPath: string; readonly taskName: string };
  /** Service short name, for linking to Services. */
  readonly serviceName?: string;
}

export interface StartupApprovedRef {
  readonly hive: 'HKCU' | 'HKLM';
  readonly path: string;
  readonly view: 'default' | '32';
  readonly valueName: string;
  /** True when a REG_BINARY value exists; false means Windows' default enabled state. */
  readonly exists: boolean;
  /** Exact raw REG_BINARY data when the value exists, lower-case hex. */
  readonly bytes?: string;
}

export interface StartupProgramsResult {
  readonly entries: readonly StartupEntry[];
  readonly warnings: readonly string[];
}
