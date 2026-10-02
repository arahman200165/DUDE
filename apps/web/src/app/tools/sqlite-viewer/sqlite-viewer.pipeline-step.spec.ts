import initSqlJs from 'sql.js';
import { describe, expect, it } from 'vitest';
import { pipelineStep } from './sqlite-viewer.pipeline-step';

async function buildSampleDatabaseBase64(): Promise<string> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run("CREATE TABLE users (id INTEGER, name TEXT); INSERT INTO users VALUES (1, 'Alice'), (2, 'Bob');");
  const bytes = db.export();
  db.close();

  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

describe('sqlite-viewer pipeline step', () => {
  it('inspects a bytes value and returns its first table', async () => {
    const base64 = await buildSampleDatabaseBase64();
    const result = await pipelineStep.run({ type: 'bytes', value: base64 });
    expect(result).toEqual({
      ok: true,
      output: { type: 'table', value: { columns: ['id', 'name'], rows: [['1', 'Alice'], ['2', 'Bob']] } },
    });
  });

  it('inspects a file value and returns its first table', async () => {
    const base64 = await buildSampleDatabaseBase64();
    const result = await pipelineStep.run({
      type: 'file',
      value: { name: 'data.sqlite', mimeType: 'application/octet-stream', base64 },
    });
    expect(result.ok).toBe(true);
  });

  it('fails on bytes that are not a valid SQLite file', async () => {
    const invalid = btoa(String.fromCharCode(1, 2, 3, 4, 5));
    const result = await pipelineStep.run({ type: 'bytes', value: invalid });
    expect(result.ok).toBe(false);
  });

  it('rejects unsupported input types', async () => {
    const result = await pipelineStep.run({ type: 'text', value: 'nope' });
    expect(result).toEqual({ ok: false, error: { message: 'SQLite File Viewer expects file or bytes input.', kind: 'invalid-input' } });
  });
});
