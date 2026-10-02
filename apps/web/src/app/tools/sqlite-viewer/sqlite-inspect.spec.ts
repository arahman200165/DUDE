import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import initSqlJs from 'sql.js';
import { inspectSqlite } from './sqlite-inspect';

async function buildSampleDatabase(): Promise<Uint8Array> {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run('CREATE TABLE users (id INTEGER, name TEXT); INSERT INTO users VALUES (1, \'Alice\'), (2, \'Bob\');');
  db.run('CREATE TABLE tags (label TEXT);');
  const bytes = db.export();
  db.close();
  return bytes;
}

describe('inspectSqlite', () => {
  it('lists every table with its columns and rows', async () => {
    const bytes = await buildSampleDatabase();

    const result = await inspectSqlite(bytes);

    expect(result).toEqual({
      ok: true,
      tables: [
        {
          name: 'tags',
          columns: [],
          rows: [],
        },
        {
          name: 'users',
          columns: ['id', 'name'],
          rows: [
            ['1', 'Alice'],
            ['2', 'Bob'],
          ],
        },
      ],
    });
  });

  it('rejects an empty file', async () => {
    expect((await inspectSqlite(new Uint8Array(0))).ok).toBe(false);
  });

  it('reports an error for bytes that are not a valid SQLite file', async () => {
    const result = await inspectSqlite(new Uint8Array([1, 2, 3, 4, 5]));

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.message.length > 0).toBe(true);
  });
});

describe('cross-check against an independently-written SQLite file (DUDE_PRD.md §21 Phase 23 Item 2)', () => {
  it('reads a database file written by Python stdlib sqlite3 (CPython\'s own SQLite build), not sql.js', async () => {
    // __fixtures__/golden.sqlite is written by Python's sqlite3 module -- a separately-built SQLite
    // engine from the sql.js/WASM one this tool uses to read it -- so a match is a genuine
    // independent cross-check, not a round-trip through the same engine. See __fixtures__/README.md.
    const bytes = readFileSync(resolve(process.cwd(), 'apps/web/src/app/tools/sqlite-viewer/__fixtures__/golden.sqlite'));

    const result = await inspectSqlite(new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength));

    expect(result).toEqual({
      ok: true,
      tables: [
        { name: 'employees', columns: ['id', 'name', 'department', 'salary'], rows: [
          ['1', 'Ada Lovelace', 'Engineering', '95000.5'],
          ['2', 'Grace Hopper', 'Engineering', '98000'],
          ['3', 'Margaret Hamilton', '', '91000.25'],
        ] },
        { name: 'empty_table', columns: [], rows: [] },
      ],
    });
  });
});
