import { CsvCleanOptions } from "./csv-clean.js";

export interface CsvCleanPayload {
  readonly input: string;
  readonly options: CsvCleanOptions;
}
