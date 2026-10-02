import { QueryLanguage } from "./json-query-eval.js";

export interface JsonQueryPayload {
  readonly jsonInput: string;
  readonly query: string;
  readonly language: QueryLanguage;
}
