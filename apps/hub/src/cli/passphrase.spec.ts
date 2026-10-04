import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { BACKUP_PASSPHRASE_ENV, readPassphrase } from './passphrase.js';
import type { ReadPassphraseOptions } from './passphrase.js';

type Stdin = ReadPassphraseOptions['stdin'];

/** A terminal: each prompt (a `setRawMode(true)` call) receives the next scripted list of key chunks. */
class FakeTerminal extends EventEmitter {
  isTTY = true;
  rawModes: boolean[] = [];
  private prompts: string[][];
  constructor(prompts: string[][]) {
    super();
    this.prompts = prompts;
  }
  setRawMode(mode: boolean): void {
    this.rawModes.push(mode);
    if (!mode) return;
    const keys = this.prompts.shift() ?? [];
    setImmediate(() => { for (const key of keys) this.emit('data', key); });
  }
  setEncoding(): this { return this; }
  resume(): this { return this; }
  pause(): this { return this; }
}

const sink = (): { writes: string[]; stream: Pick<NodeJS.WritableStream, 'write'> } => {
  const writes: string[] = [];
  return { writes, stream: { write: (text: string | Uint8Array): boolean => { writes.push(String(text)); return true; } } };
};

const terminalOptions = (terminal: FakeTerminal, out: ReturnType<typeof sink>, extra: Partial<ReadPassphraseOptions> = {}): ReadPassphraseOptions => ({
  env: {}, stdin: terminal as unknown as Stdin, stderr: out.stream, prompt: 'Passphrase: ', ...extra,
});

const piped = (text: string): PassThrough => {
  const stream = new PassThrough();
  stream.end(text);
  return stream;
};

describe('readPassphrase', () => {
  it('uses a non-empty environment variable without touching stdin or the prompt', async () => {
    const out = sink();
    const stdin = new PassThrough();
    const result = await readPassphrase({ env: { [BACKUP_PASSPHRASE_ENV]: ' env passphrase 123 ' }, stdin, stderr: out.stream, prompt: 'p: ' });
    expect(result).toBe(' env passphrase 123 ');
    expect(out.writes).toEqual([]);
    expect(stdin.listenerCount('data')).toBe(0);
  });

  it('ignores an empty environment variable and falls back to stdin', async () => {
    const out = sink();
    expect(await readPassphrase({ env: { [BACKUP_PASSPHRASE_ENV]: '' }, stdin: piped('from-pipe-1234\n') as unknown as Stdin, stderr: out.stream, prompt: 'p: ' })).toBe('from-pipe-1234');
  });

  it('reads exactly the first line of a pipe and strips LF and CRLF', async () => {
    const out = sink();
    const base = { env: {}, stderr: out.stream, prompt: 'p: ' };
    expect(await readPassphrase({ ...base, stdin: piped('first line pass\nsecond line\n') as unknown as Stdin })).toBe('first line pass');
    expect(await readPassphrase({ ...base, stdin: piped('crlf passphrase\r\nignored\r\n') as unknown as Stdin })).toBe('crlf passphrase');
    expect(await readPassphrase({ ...base, stdin: piped('no newline at all') as unknown as Stdin })).toBe('no newline at all');
    expect(out.writes).toEqual([]);
  });

  it('keeps a first line that arrives in several chunks and non-ASCII text intact', async () => {
    const stdin = new PassThrough();
    const pending = readPassphrase({ env: {}, stdin: stdin as unknown as Stdin, stderr: sink().stream, prompt: 'p: ' });
    const bytes = Buffer.from('pässphräse-ünïcode\n', 'utf8');
    stdin.write(bytes.subarray(0, 2));
    stdin.write(bytes.subarray(2, 9));
    stdin.write(bytes.subarray(9));
    expect(await pending).toBe('pässphräse-ünïcode');
  });

  it('rejects an empty line or empty input', async () => {
    const base = { env: {}, stderr: sink().stream, prompt: 'p: ' };
    await expect(readPassphrase({ ...base, stdin: piped('\r\nsecret\n') as unknown as Stdin })).rejects.toThrow(/empty/);
    await expect(readPassphrase({ ...base, stdin: piped('') as unknown as Stdin })).rejects.toThrow(/empty/);
  });

  it('prompts on a terminal without echo, handles Backspace and Enter, and restores the terminal', async () => {
    const out = sink();
    const terminal = new FakeTerminal([['abc', 'x', '\u007f', 'def', '\r']]);
    const result = await readPassphrase(terminalOptions(terminal, out));
    expect(result).toBe('abcdef');
    expect(terminal.rawModes).toEqual([true, false]);
    expect(out.writes.join('')).toBe('Passphrase: \n');
    expect(out.writes.join('')).not.toContain('abc');
    expect(terminal.listenerCount('data')).toBe(0);
  });

  it('ignores escape sequences and other control keys', async () => {
    const terminal = new FakeTerminal([['ab', '\u001b[A', '\t', 'cd\n']]);
    expect(await readPassphrase(terminalOptions(terminal, sink()))).toBe('abcd');
  });

  it('asks twice with confirm and returns the matching entry', async () => {
    const out = sink();
    const terminal = new FakeTerminal([['same passphrase 1', '\r'], ['same passphrase 1', '\r']]);
    expect(await readPassphrase(terminalOptions(terminal, out, { confirm: true }))).toBe('same passphrase 1');
    expect(out.writes.filter((w) => w.endsWith(': '))).toEqual(['Passphrase: ', 'Confirm passphrase: ']);
  });

  it('rejects mismatched confirmation entries', async () => {
    const terminal = new FakeTerminal([['first entry value', '\r'], ['other entry value', '\r']]);
    await expect(readPassphrase(terminalOptions(terminal, sink(), { confirm: true }))).rejects.toThrow('The two passphrases do not match.');
    expect(terminal.rawModes.at(-1)).toBe(false);
  });

  it('does not ask twice without confirm and rejects an empty terminal entry', async () => {
    const terminal = new FakeTerminal([['\r']]);
    await expect(readPassphrase(terminalOptions(terminal, sink()))).rejects.toThrow(/empty/);
  });

  it('rejects on Ctrl-C with a cancelled error and restores the terminal', async () => {
    const out = sink();
    const terminal = new FakeTerminal([['abc', '\u0003']]);
    await expect(readPassphrase(terminalOptions(terminal, out))).rejects.toThrow(/cancelled/);
    expect(terminal.rawModes).toEqual([true, false]);
    expect(terminal.listenerCount('data')).toBe(0);
  });

  it('never prefers a terminal over the environment variable', async () => {
    const terminal = new FakeTerminal([['should not be read', '\r']]);
    expect(await readPassphrase(terminalOptions(terminal, sink(), { env: { [BACKUP_PASSPHRASE_ENV]: 'env wins 123456' } }))).toBe('env wins 123456');
    expect(terminal.rawModes).toEqual([]);
  });
});
