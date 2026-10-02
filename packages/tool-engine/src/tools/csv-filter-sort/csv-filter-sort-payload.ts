import { CsvFilterOperator, CsvSortDirection } from "./csv-filter-sort-transform.js";

export interface CsvFilterSortPayload {
  readonly input: string;
  readonly filterColumn: string;
  readonly operator: CsvFilterOperator;
  readonly filterValue: string;
  readonly sortColumn: string;
  readonly sortDirection: CsvSortDirection;
}
