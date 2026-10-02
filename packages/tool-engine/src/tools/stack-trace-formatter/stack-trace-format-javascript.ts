import { FormattedLine, FormattedTrace } from "./stack-trace-types.js";

function classifyFrame(trimmed: string): 'frame-app' | 'frame-library' {
  return /node_modules|\bnode:/.test(trimmed) ? 'frame-library' : 'frame-app';
}

/** Formats a V8 (Node/browser) stack trace, tagging node_modules/internal frames as library frames. */
export function formatJavaScriptStackTrace(text: string): FormattedTrace {
  const lines: FormattedLine[] = text.split('\n').map((rawLine) => {
    const line = rawLine.replace(/\r$/, '');
    const trimmed = line.trim();

    if (/^at\s+/.test(trimmed)) return { text: line, kind: classifyFrame(trimmed) };
    return { text: line, kind: 'header' };
  });

  return { lines };
}
