import { TomlMode } from "./toml-format.js";

export interface TomlFormatPayload {
  readonly input: string;
  readonly mode: TomlMode;
}
