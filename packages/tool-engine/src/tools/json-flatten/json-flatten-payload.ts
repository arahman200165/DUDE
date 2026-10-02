import { FlattenDirection } from "./json-flatten-transform.js";

export interface JsonFlattenPayload {
  readonly input: string;
  readonly direction: FlattenDirection;
}
