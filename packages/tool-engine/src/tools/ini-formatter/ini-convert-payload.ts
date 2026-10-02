import { IniDirection } from "./ini-convert.js";

export interface IniConvertPayload {
  readonly input: string;
  readonly direction: IniDirection;
}
