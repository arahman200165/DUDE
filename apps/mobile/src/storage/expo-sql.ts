import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import { SerialGate } from './serial-gate';
import type { SqlConnection, SqlDatabase, SqlValue } from './sql';

/**
 * Every statement on the shared connection goes through the gate (see SerialGate for the native evidence). A transaction handle is
 * only ever used inside its own gated `exclusive` call, so its statements are already serialized.
 */
function connection(db: SQLiteDatabase, gate?: SerialGate): SqlConnection {
  const gated = <T>(work: () => Promise<T>): Promise<T> => gate ? gate.run(work) : work();
  return {
    exec: sql => gated(() => db.execAsync(sql)),
    run: (sql, ...values: SqlValue[]) => gated(async () => { await db.runAsync(sql, values); }),
    all: <T>(sql: string, ...values: SqlValue[]) => gated(() => db.getAllAsync<T>(sql, values)),
    first: <T>(sql: string, ...values: SqlValue[]) => gated(() => db.getFirstAsync<T>(sql, values)),
  };
}
/** Default Expo database directory is application-private; backup exclusion is enforced by the native plugin. */
export async function openMobileDatabase(): Promise<SqlDatabase> {
  const db = await openDatabaseAsync('dude-mobile.db');
  const gate = new SerialGate();
  return {
    ...connection(db, gate),
    exclusive: <T>(work: (tx: SqlConnection) => Promise<T>) => gate.run(async () => {
      let result!: T;
      await db.withExclusiveTransactionAsync(async tx => { result = await work(connection(tx)); });
      return result;
    }),
    close: () => gate.close(() => db.closeAsync()),
  };
}
