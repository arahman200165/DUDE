export const BACKUP_PASSPHRASE_ENV = 'DUDE_HUB_BACKUP_PASSPHRASE';

type PassphraseInput = NodeJS.ReadableStream & { isTTY?: boolean; setRawMode?: (mode: boolean) => unknown };

export interface ReadPassphraseOptions {
  env: Record<string, string | undefined>;
  stdin: PassphraseInput;
  stderr: Pick<NodeJS.WritableStream, 'write'>;
  prompt: string;
  /** Ask twice and require both entries to match (interactive prompt only). */
  confirm?: boolean;
}

const CONFIRM_PROMPT = 'Confirm passphrase: ';

const stripLineEnd = (text: string): string => text.replace(/[\r\n]+$/u, '');

/** Reads exactly the first line of a non-interactive stream (a pipe or a file), without its line ending. */
function readFirstLine(stdin: PassphraseInput): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let buffer = '';
    const done = (value: string): void => {
      stdin.removeListener('data', onData);
      stdin.removeListener('end', onEnd);
      stdin.removeListener('error', onError);
      stdin.pause();
      resolve(value);
    };
    const onData = (chunk: string | Buffer): void => {
      buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      const newline = buffer.indexOf('\n');
      if (newline >= 0) done(stripLineEnd(buffer.slice(0, newline + 1)));
    };
    const onEnd = (): void => done(stripLineEnd(buffer));
    const onError = (error: Error): void => {
      stdin.removeListener('data', onData);
      stdin.removeListener('end', onEnd);
      reject(error);
    };
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
    stdin.on('end', onEnd);
    stdin.on('error', onError);
    stdin.resume();
  });
}

/** One no-echo line from a terminal in raw mode: Enter submits, Backspace edits, Ctrl-C cancels. */
function readTerminalLine(stdin: PassphraseInput, stderr: Pick<NodeJS.WritableStream, 'write'>, prompt: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let chars: string[] = [];
    stderr.write(prompt);
    const finish = (error: Error | null): void => {
      stdin.removeListener('data', onData);
      stdin.removeListener('error', onError);
      try { stdin.setRawMode?.(false); } catch { /* the terminal is gone */ }
      stdin.pause();
      stderr.write('\n');
      if (error) reject(error);
      else resolve(chars.join(''));
    };
    const onError = (error: Error): void => finish(error);
    const onData = (chunk: string | Buffer): void => {
      const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      // An escape sequence (arrow or function key) is ignored whole.
      if (text.startsWith('\u001b')) return;
      for (const char of text) {
        if (char === '\r' || char === '\n') return finish(null);
        if (char === '\u0003') return finish(new Error('The passphrase prompt was cancelled.'));
        if (char === '\u007f' || char === '\b') chars = chars.slice(0, -1);
        else if (char >= ' ') chars.push(char);
      }
    };
    try { stdin.setRawMode?.(true); } catch { /* not every terminal supports it */ }
    stdin.setEncoding('utf8');
    stdin.on('data', onData);
    stdin.on('error', onError);
    stdin.resume();
  });
}

/**
 * The backup passphrase, never from a command-line flag and never echoed. Sources, in order: a non-empty
 * `DUDE_HUB_BACKUP_PASSPHRASE`; the first line of standard input when it is not a terminal; a no-echo prompt
 * (asked twice when `confirm` is set).
 */
export async function readPassphrase(options: ReadPassphraseOptions): Promise<string> {
  const fromEnv = options.env[BACKUP_PASSPHRASE_ENV];
  if (fromEnv !== undefined && fromEnv.length > 0) return fromEnv;
  if (options.stdin.isTTY !== true) {
    const line = await readFirstLine(options.stdin);
    if (line.length === 0) throw new Error('The passphrase is empty.');
    return line;
  }
  const first = await readTerminalLine(options.stdin, options.stderr, options.prompt);
  if (first.length === 0) throw new Error('The passphrase is empty.');
  if (options.confirm === true) {
    const second = await readTerminalLine(options.stdin, options.stderr, CONFIRM_PROMPT);
    if (second !== first) throw new Error('The two passphrases do not match.');
  }
  return first;
}
