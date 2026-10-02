import { detectStackTraceLanguage } from "./stack-trace-detect.js";
import { formatDotNetStackTrace } from "./stack-trace-format-dotnet.js";
import { formatJavaStackTrace } from "./stack-trace-format-java.js";
import { formatJavaScriptStackTrace } from "./stack-trace-format-javascript.js";
import { formatPythonStackTrace } from "./stack-trace-format-python.js";
import { FormattedTrace, StackTraceLanguage } from "./stack-trace-types.js";

export type StackTraceMode = 'auto' | StackTraceLanguage;

export interface StackTraceFormatResult {
  readonly language: StackTraceLanguage | 'unknown';
  readonly trace: FormattedTrace;
}

/** Every line untouched, tagged 'other' — used when the language can't be recognized or confirmed. */
function passthrough(text: string): FormattedTrace {
  return { lines: text.split('\n').map((line) => ({ text: line.replace(/\r$/, ''), kind: 'other' as const })) };
}

/** The one entry point the component calls: resolves 'auto' via detection, then delegates to that language's formatter. */
export function formatStackTrace(text: string, mode: StackTraceMode): StackTraceFormatResult {
  const language = mode === 'auto' ? detectStackTraceLanguage(text) : mode;

  switch (language) {
    case 'java':
      return { language, trace: formatJavaStackTrace(text) };
    case 'dotnet':
      return { language, trace: formatDotNetStackTrace(text) };
    case 'javascript':
      return { language, trace: formatJavaScriptStackTrace(text) };
    case 'python':
      return { language, trace: formatPythonStackTrace(text) };
    default:
      return { language: 'unknown', trace: passthrough(text) };
  }
}
