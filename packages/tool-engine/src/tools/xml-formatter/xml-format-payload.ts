import { XmlIndent, XmlMode } from "./xml-format.js";

export interface XmlFormatPayload {
  readonly input: string;
  readonly mode: XmlMode;
  readonly indent: XmlIndent;
}
