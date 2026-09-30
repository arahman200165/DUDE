import type { PowerShellBuilderWarning } from './powershell-builder';

/** Wire types shared by the PowerShell workbench (electron/powershell-workbench.ts) and its renderer service (M612). */
export interface PowerShellRunPreview {
  readonly previewId: string;
  readonly script: string;
  readonly sha256: string;
  readonly cwd: string;
  readonly elevated: boolean;
  readonly warnings: readonly PowerShellBuilderWarning[];
  readonly expiresAt: string;
}
export interface PowerShellRunEvent {
  readonly runId: string;
  readonly stream: 'stdout' | 'stderr' | 'complete';
  readonly text?: string;
  readonly exitCode?: number | null;
  readonly timedOut?: boolean;
  readonly cancelled?: boolean;
  readonly truncated?: boolean;
  readonly error?: string;
}
export interface PowerShellHistoryEntry {
  readonly id: string;
  readonly sha256: string;
  readonly cwd: string;
  readonly elevated: boolean;
  readonly startedAt: string;
  readonly completedAt: string;
  readonly exitCode: number | null;
  readonly timedOut: boolean;
  readonly cancelled: boolean;
  readonly truncated: boolean;
}
