import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';
import type { SqlConnection, SqlDatabase, SqlValue } from './sql';

function connection(db: SQLiteDatabase): SqlConnection {
  return {
    exec: sql => db.execAsync(sql),
    run: async (sql, ...values: SqlValue[]) => { await db.runAsync(sql, values); },
    all: <T>(sql: string, ...values: SqlValue[]) => db.getAllAsync<T>(sql, values),
    first: <T>(sql: string, ...values: SqlValue[]) => db.getFirstAsync<T>(sql, values),
  };
}
/** Default Expo database directory is application-private; backup exclusion is enforced by the native plugin. */
export async function openMobileDatabase(): Promise<SqlDatabase> {
  const db = await openDatabaseAsync('dude-mobile.db');
  return {
    ...connection(db),
    exclusive: async <T>(work: (tx: SqlConnection) => Promise<T>) => {
      let result!: T;
      await db.withExclusiveTransactionAsync(async tx => { result = await work(connection(tx)); });
      return result;
    },
    close: () => db.closeAsync(),
  };
}
