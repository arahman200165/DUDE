import { CsvSqlDirection } from "./csv-sql-transform.js";

export interface CsvSqlPayload {
  readonly input: string;
  readonly direction: CsvSqlDirection;
  readonly tableName: string;
}
