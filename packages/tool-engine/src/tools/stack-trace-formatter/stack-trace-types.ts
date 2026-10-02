export type StackTraceLanguage = 'java' | 'dotnet' | 'javascript' | 'python';

export type StackTraceLineKind = 'header' | 'frame-app' | 'frame-library' | 'cause' | 'other';

export interface FormattedLine {
  readonly text: string;
  readonly kind: StackTraceLineKind;
}

export interface FormattedTrace {
  readonly lines: readonly FormattedLine[];
}
