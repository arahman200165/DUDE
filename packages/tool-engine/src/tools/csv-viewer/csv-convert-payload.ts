import { CsvDelimiter, CsvDirection } from "./csv-convert.js";

export interface CsvConvertPayload {
  readonly input: string;
  readonly direction: CsvDirection;
  readonly delimiter: CsvDelimiter;
  readonly hasHeaderRow: boolean;
}
