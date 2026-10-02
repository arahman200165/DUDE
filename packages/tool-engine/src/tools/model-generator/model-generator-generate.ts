import { flattenModel } from "./model-generator-flatten.js";
import { inferFromJson } from "./model-generator-infer.js";
import { emitCSharp } from "./model-generator-emit-csharp.js";
import { emitGo } from "./model-generator-emit-go.js";
import { emitJava } from "./model-generator-emit-java.js";
import { emitKotlin } from "./model-generator-emit-kotlin.js";
import { emitPython } from "./model-generator-emit-python.js";
import { emitRust } from "./model-generator-emit-rust.js";
import { emitSql } from "./model-generator-emit-sql.js";
import { emitSwift } from "./model-generator-emit-swift.js";
import { emitTypeScript } from "./model-generator-emit-typescript.js";
import { EmitResult, FlattenedModel } from "./model-generator-types.js";

export type ModelLanguage = 'typescript' | 'csharp' | 'java' | 'kotlin' | 'swift' | 'python' | 'rust' | 'go' | 'sql';

export const MODEL_LANGUAGES: Record<ModelLanguage, string> = {
  typescript: 'TypeScript',
  csharp: 'C#',
  java: 'Java',
  kotlin: 'Kotlin',
  swift: 'Swift',
  python: 'Python (dataclass)',
  rust: 'Rust',
  go: 'Go',
  sql: 'SQL (CREATE TABLE)',
};

const EMITTERS: Record<ModelLanguage, (model: FlattenedModel) => EmitResult> = {
  typescript: emitTypeScript,
  csharp: emitCSharp,
  java: emitJava,
  kotlin: emitKotlin,
  swift: emitSwift,
  python: emitPython,
  rust: emitRust,
  go: emitGo,
  sql: emitSql,
};

export type ModelGenerateResult = ({ readonly ok: true } & EmitResult) | { readonly ok: false; readonly error: string };

/** The one entry point the component calls: parse JSON, infer its shape, flatten it, emit code. */
export function generateModel(input: string, rootName: string, language: ModelLanguage): ModelGenerateResult {
  const inferred = inferFromJson(input);
  if (!inferred.ok) return { ok: false, error: inferred.error };

  const flattened = flattenModel(inferred.root, rootName.trim() === '' ? 'Root' : rootName);
  const emitted = EMITTERS[language](flattened);
  return { ok: true, ...emitted };
}
