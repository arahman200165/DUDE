import { createReadStream, promises as fs } from 'node:fs';
import { compileQuery, type SearchQuery } from '../src/shared-logic/fs/text-search';
import { registerFsJob } from './fs-jobs';
import { paramsOf, targetOf } from './fs-job-walk';

/**
 * Large-File Streaming Inspector jobs (Phase 29 item 14, Milestone 533). Files of any size are only
 * ever streamed or read in ranges, never loaded whole: a sparse line index (the byte offset of every
 * Nth line) lets the renderer page a multi-gigabyte log by line number, and find streams matches with
 * their byte offsets and line numbers. UTF-8 (or ASCII-compatible) text is assumed for line/regex
 * work; hex find works on raw bytes.
 */

export const INDEX_STRIDE = 1000;
const MAX_FINDS = 10_000;
const MAX_LINE_BYTES = 64 * 1024;

registerFsJob('line-index', async (context) => {
  const target = targetOf(context);
  const size = (await fs.stat(target)).size;
  const offsets = [0];
  let lines = 0;
  let position = 0;
  for await (const chunk of createReadStream(target, { highWaterMark: 4 * 1024 * 1024, signal: context.signal }) as AsyncIterable<Buffer>) {
    for (let index = chunk.indexOf(10); index >= 0; index = chunk.indexOf(10, index + 1)) {
      lines++;
      if (lines % INDEX_STRIDE === 0) offsets.push(position + index + 1);
    }
    position += chunk.length;
    context.progress({ phase: 'Indexing lines', scanned: lines, bytes: position, total: size });
  }
  // A last line without a trailing newline still counts.
  const unterminated = size > 0 && (await readByte(target, size - 1)) !== 10;
  return { size, stride: INDEX_STRIDE, offsets, lines: lines + (unterminated ? 1 : 0) };
});

async function readByte(path: string, offset: number): Promise<number> {
  const handle = await fs.open(path, 'r');
  try { const buffer = Buffer.alloc(1); await handle.read(buffer, 0, 1, offset); return buffer[0]; } finally { await handle.close(); }
}

function parseHex(pattern: string): Buffer {
  const clean = pattern.replace(/0x/gi, '').replace(/[\s,]/g, '');
  if (!clean || clean.length % 2 || /[^0-9a-f]/i.test(clean)) throw new Error('Enter hex bytes like "4D 5A 90 00".');
  return Buffer.from(clean, 'hex');
}

registerFsJob('find-in-file', async (context) => {
  const params = paramsOf(context);
  const target = targetOf(context);
  const size = (await fs.stat(target)).size;
  const limit = Math.min(MAX_FINDS, Math.max(1, Number(params['maxResults']) || 1000));
  const from = Math.max(0, Math.floor(Number(params['from']) || 0));
  let found = 0;

  if (params['mode'] === 'hex') {
    const needle = parseHex(String(params['pattern'] ?? ''));
    let carry = Buffer.alloc(0);
    let base = from;
    for await (const chunk of createReadStream(target, { start: from, highWaterMark: 4 * 1024 * 1024, signal: context.signal }) as AsyncIterable<Buffer>) {
      const haystack = Buffer.concat([carry, chunk]);
      const origin = base - carry.length;
      for (let index = haystack.indexOf(needle); index >= 0 && found < limit; index = haystack.indexOf(needle, index + 1)) {
        if (index + needle.length <= carry.length) continue; // already reported in the previous window
        found++;
        context.batch({ offset: origin + index, length: needle.length });
      }
      carry = haystack.subarray(Math.max(0, haystack.length - (needle.length - 1)));
      base += chunk.length;
      context.progress({ phase: 'Searching bytes', scanned: found, bytes: base, total: size });
      if (found >= limit) break;
    }
    return { found, truncated: found >= limit, size };
  }

  const query: SearchQuery = { pattern: String(params['pattern'] ?? ''), regex: params['regex'] === true, caseSensitive: params['caseSensitive'] === true, wholeWord: params['wholeWord'] === true };
  const regex = compileQuery(query);
  const decoder = new TextDecoder('utf-8');
  let line = Math.max(1, Math.floor(Number(params['fromLine']) || 1));
  let lineStart = from;
  let pending: Buffer[] = [];
  let pendingBytes = 0;
  const scanLine = (bytes: Buffer, offset: number) => {
    const text = decoder.decode(bytes.length > MAX_LINE_BYTES ? bytes.subarray(0, MAX_LINE_BYTES) : bytes).replace(/\r$/, '');
    regex.lastIndex = 0;
    for (let match = regex.exec(text); match && found < limit; match = regex.exec(text)) {
      if (!match[0].length) { regex.lastIndex++; continue; }
      found++;
      const column = match.index;
      context.batch({ line, column, offset: offset + Buffer.byteLength(text.slice(0, column)), length: Buffer.byteLength(match[0]), text: text.length > 400 ? text.slice(Math.max(0, column - 120), column + 280) : text, textColumn: text.length > 400 ? Math.min(column, 120) : column });
    }
  };
  let position = from;
  for await (const chunk of createReadStream(target, { start: from, highWaterMark: 4 * 1024 * 1024, signal: context.signal }) as AsyncIterable<Buffer>) {
    let start = 0;
    for (let index = chunk.indexOf(10); index >= 0; index = chunk.indexOf(10, index + 1)) {
      const piece = chunk.subarray(start, index);
      const bytes = pending.length ? Buffer.concat([...pending, piece]) : piece;
      scanLine(bytes, lineStart);
      lineStart += pendingBytes + piece.length + 1;
      pending = [];
      pendingBytes = 0;
      start = index + 1;
      line++;
      if (found >= limit) break;
    }
    if (found >= limit) break;
    if (start < chunk.length && pendingBytes < MAX_LINE_BYTES * 2) { pending.push(chunk.subarray(start)); pendingBytes += chunk.length - start; }
    else if (start < chunk.length) pendingBytes += chunk.length - start;
    position += chunk.length;
    context.progress({ phase: 'Searching', scanned: found, bytes: position, total: size });
  }
  if (pending.length && found < limit) scanLine(Buffer.concat(pending), lineStart);
  return { found, truncated: found >= limit, size };
});
