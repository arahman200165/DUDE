import { XmlCsvDirection } from "./xml-csv-transform.js";

export interface XmlCsvPayload {
  readonly input: string;
  readonly direction: XmlCsvDirection;
  readonly recordElement: string;
}
