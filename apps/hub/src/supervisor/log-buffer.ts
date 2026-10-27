import { REDACTED } from './redact.js';

export type LogStream = 'stdout' | 'stderr' | 'supervisor';

export interface LogLine {
  /** Milliseconds since the epoch when the line completed. */
  at: number;
  stream: LogStream;
  text: string;
}

export interface LogBufferOptions {
  /** Most lines kept (oldest dropped first). Default 200. */
  maxLines?: number;
  /** Most characters kept across all lines. Default 64 KiB. */
  maxChars?: number;
  /** Longest single line; the rest of a longer line is dropped. Default 2048. */
  maxLineChars?: number;
  now?: () => number;
}

export interface LogBuffer {
  /** Feeds a chunk of child output; complete lines are redacted, bounded and kept, a partial line waits for its newline. */
  push(stream: LogStream, chunk: string): void;
  /** Adds one supervisor-authored line (never child output). */
  note(text: string): void;
  /** A copy of the kept lines, oldest first. */
  lines(): LogLine[];
  /** Replaces the redaction function (a new child process, a new secret); applies to lines from now on. */
  setRedactor(redact: (text: string) => string): void;
  clear(): void;
}

/** Characters cut from the end of a truncated line, so the prefix of a token that straddles the cut is not kept. */
const TRUNCATION_MARGIN = 24;
/** A token prefix left dangling at a cut cannot match the full pattern, so it is removed explicitly. */
const DANGLING_TOKEN_START = /eyJ[A-Za-z0-9+/_-]*={0,2}$/;
const STREAMS: readonly LogStream[] = ['stdout', 'stderr', 'supervisor'];

/**
 * The bounded in-memory ring of a child's output (32-SS1, Milestone 836). Bounded three ways (lines, total characters, line
 * length); every line is redacted BEFORE it is stored, and a line is only stored once complete (or cut), so a secret split
 * across two chunks is still seen whole. Nothing here writes to disk.
 */
export function createLogBuffer(options: LogBufferOptions = {}, initialRedact: (text: string) => string = (text) => text): LogBuffer {
  const maxLines = Math.max(1, options.maxLines ?? 200);
  const maxChars = Math.max(64, options.maxChars ?? 64 * 1024);
  const maxLineChars = Math.max(64, options.maxLineChars ?? 2048);
  const now = options.now ?? Date.now;
  let redact = initialRedact;
  let kept: LogLine[] = [];
  let chars = 0;
  const partial: Record<LogStream, string> = { stdout: '', stderr: '', supervisor: '' };
  const skipping: Record<LogStream, boolean> = { stdout: false, stderr: false, supervisor: false };

  const store = (stream: LogStream, text: string): void => {
    kept.push({ at: now(), stream, text });
    chars += text.length;
    while (kept.length > maxLines || (chars > maxChars && kept.length > 1)) {
      const dropped = kept.shift();
      if (dropped) chars -= dropped.text.length;
    }
  };

  const cut = (text: string): string => redact(text.slice(0, maxLineChars - TRUNCATION_MARGIN)).replace(DANGLING_TOKEN_START, REDACTED);

  const complete = (stream: LogStream, line: string): void => {
    if (skipping[stream]) { skipping[stream] = false; return; }
    store(stream, line.length > maxLineChars ? `${cut(line)} [truncated]` : redact(line));
  };

  return {
    push(stream, chunk) {
      if (chunk.length === 0) return;
      const pieces = (partial[stream] + chunk).split(/\r?\n/);
      partial[stream] = pieces.pop() ?? '';
      for (const piece of pieces) complete(stream, piece);
      if (partial[stream].length > maxLineChars) {
        // An over-long line: keep its start (without the tail that could hold a token prefix) and drop the rest up to its newline.
        if (!skipping[stream]) store(stream, `${cut(partial[stream])} [truncated]`);
        skipping[stream] = true;
        partial[stream] = '';
      }
    },
    note(text) { store('supervisor', redact(text).slice(0, maxLineChars)); },
    lines() { return kept.map((line) => ({ ...line })); },
    setRedactor(next) { redact = next; },
    clear() {
      kept = [];
      chars = 0;
      for (const stream of STREAMS) { partial[stream] = ''; skipping[stream] = false; }
    },
  };
}
