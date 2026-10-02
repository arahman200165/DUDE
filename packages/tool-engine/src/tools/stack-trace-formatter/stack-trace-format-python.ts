import { FormattedLine, FormattedTrace, StackTraceLineKind } from "./stack-trace-types.js";

function classifyFrame(fileLine: string): 'frame-app' | 'frame-library' {
  return /site-packages|dist-packages|[\\/]lib[\\/]python|^\s*File "<frozen /.test(fileLine) ? 'frame-library' : 'frame-app';
}

/**
 * Formats a Python traceback. Frames come as a `File "...", line N, in func` line followed by an
 * indented source snippet — the snippet inherits its File line's kind so collapsing library frames
 * hides both together.
 */
export function formatPythonStackTrace(text: string): FormattedTrace {
  const rawLines = text.split('\n').map((line) => line.replace(/\r$/, ''));
  const lines: FormattedLine[] = [];
  let lastFrameKind: StackTraceLineKind = 'other';

  for (const line of rawLines) {
    const trimmed = line.trim();

    if (/^Traceback \(most recent call last\):$/.test(trimmed)) {
      lines.push({ text: line, kind: 'header' });
      continue;
    }

    if (/^File "/.test(trimmed)) {
      lastFrameKind = classifyFrame(trimmed);
      lines.push({ text: line, kind: lastFrameKind });
      continue;
    }

    // The exception's final summary line is unindented and comes after at least one frame.
    if (line === trimmed && lines.length > 0 && trimmed !== '') {
      lines.push({ text: line, kind: 'header' });
      continue;
    }

    lines.push({ text: line, kind: lastFrameKind });
  }

  return { lines };
}
