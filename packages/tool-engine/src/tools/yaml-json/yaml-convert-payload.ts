import { JsonIndent, YamlDirection } from "./yaml-convert.js";

export interface YamlConvertPayload {
  readonly input: string;
  readonly direction: YamlDirection;
  readonly indent: JsonIndent;
}
