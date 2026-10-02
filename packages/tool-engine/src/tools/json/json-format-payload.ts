import { JsonIndent, JsonMode } from "./json-format.js";

export interface JsonFormatPayload {
  readonly input: string;
  readonly mode: JsonMode;
  readonly indent: JsonIndent;
}
