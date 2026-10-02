import { JsonMergeStrategy } from "./json-merge-transform.js";

export interface JsonMergePayload {
  readonly baseInput: string;
  readonly overlayInput: string;
  readonly strategy: JsonMergeStrategy;
}
