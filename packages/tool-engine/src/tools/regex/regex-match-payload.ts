export interface RegexMatchPayload {
  readonly kind: 'match';
  readonly pattern: string;
  readonly flags: string;
  readonly testText: string;
}

export interface RegexReplacePayload {
  readonly kind: 'replace';
  readonly pattern: string;
  readonly flags: string;
  readonly testText: string;
  readonly replacement: string;
}

export type RegexWorkerPayload = RegexMatchPayload | RegexReplacePayload;
