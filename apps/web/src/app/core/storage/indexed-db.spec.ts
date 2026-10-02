// jsdom (the test environment) doesn't implement IndexedDB — this test-only dependency polyfills
// it. Never shipped: it's a devDependency, imported only from .spec.ts files.
import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { openDatabase, promisifyRequest, promisifyTransaction } from './indexed-db';

describe('indexed-db helpers', () => {
  const DB_NAME = 'test-db-' + Math.random();

  it('opens a database and can put/get through the promisified helpers', async () => {
    const db = await openDatabase(DB_NAME, 1, (database) => {
      database.createObjectStore('store', { keyPath: 'id' });
    });

    const tx = db.transaction('store', 'readwrite');
    tx.objectStore('store').put({ id: '1', value: 'hello' });
    await promisifyTransaction(tx);

    const readTx = db.transaction('store', 'readonly');
    const record = await promisifyRequest(readTx.objectStore('store').get('1'));
    expect(record).toEqual({ id: '1', value: 'hello' });
  });
});
