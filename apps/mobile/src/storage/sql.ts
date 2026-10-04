/** Every mutation uses an exclusive transaction; callers must use its handle for all statements. */
export type SqlValue = string | number | null | Uint8Array;
export interface SqlConnection {
  exec(sql: string): Promise<void>;
  run(sql: string, ...values: SqlValue[]): Promise<void>;
  all<T>(sql: string, ...values: SqlValue[]): Promise<T[]>;
  first<T>(sql: string, ...values: SqlValue[]): Promise<T | null>;
}
export interface SqlDatabase extends SqlConnection {
  exclusive<T>(work: (transaction: SqlConnection) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
