import { PropertiesDirection } from "./properties-convert.js";

export interface PropertiesConvertPayload {
  readonly input: string;
  readonly direction: PropertiesDirection;
}
