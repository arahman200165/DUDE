import { ParsedHttpRequest } from "@dude/domain/shared/http-request/http-request.model";
import { generateCSharp } from "./curl-export-csharp.js";
import { generateDart } from "./curl-export-dart.js";
import { generateFetch } from "./curl-export-fetch.js";
import { generateGo } from "./curl-export-go.js";
import { generateRawHttp } from "./curl-export-http.js";
import { generateJava } from "./curl-export-java.js";
import { generateKotlin } from "./curl-export-kotlin.js";
import { generateNode } from "./curl-export-node.js";
import { generatePhp } from "./curl-export-php.js";
import { generatePowerShell } from "./curl-export-powershell.js";
import { generatePython } from "./curl-export-python.js";
import { generatePythonHttpx } from "./curl-export-python-httpx.js";
import { generateRuby } from "./curl-export-ruby.js";
import { generateRust } from "./curl-export-rust.js";
import { generateSwift } from "./curl-export-swift.js";

export type ExportFormatId =
  | 'fetch'
  | 'python'
  | 'python-httpx'
  | 'http'
  | 'node'
  | 'csharp'
  | 'go'
  | 'powershell'
  | 'java'
  | 'kotlin'
  | 'rust'
  | 'php'
  | 'ruby'
  | 'dart'
  | 'swift';

export interface ExportFormat {
  readonly id: ExportFormatId;
  readonly label: string;
  readonly generate: (request: ParsedHttpRequest) => string;
}

export const EXPORT_FORMATS: readonly ExportFormat[] = [
  { id: 'fetch', label: 'JavaScript (fetch)', generate: generateFetch },
  { id: 'python', label: 'Python (requests)', generate: generatePython },
  { id: 'python-httpx', label: 'Python (httpx)', generate: generatePythonHttpx },
  { id: 'http', label: 'Raw HTTP/1.1', generate: generateRawHttp },
  { id: 'node', label: 'Node.js (axios)', generate: generateNode },
  { id: 'csharp', label: 'C# (HttpClient)', generate: generateCSharp },
  { id: 'go', label: 'Go (net/http)', generate: generateGo },
  { id: 'powershell', label: 'PowerShell (Invoke-RestMethod)', generate: generatePowerShell },
  { id: 'java', label: 'Java (HttpClient)', generate: generateJava },
  { id: 'kotlin', label: 'Kotlin (OkHttp)', generate: generateKotlin },
  { id: 'rust', label: 'Rust (reqwest)', generate: generateRust },
  { id: 'php', label: 'PHP (cURL)', generate: generatePhp },
  { id: 'ruby', label: 'Ruby (net/http)', generate: generateRuby },
  { id: 'dart', label: 'Dart (http)', generate: generateDart },
  { id: 'swift', label: 'Swift (URLSession)', generate: generateSwift },
];
