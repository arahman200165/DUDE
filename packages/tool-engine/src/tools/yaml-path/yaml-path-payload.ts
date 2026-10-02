import { YamlPathLanguage } from "./yaml-path-eval.js";

export interface YamlPathPayload {
  readonly yamlInput: string;
  readonly query: string;
  readonly language: YamlPathLanguage;
}
