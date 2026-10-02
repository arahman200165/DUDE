import { FormattedLine, FormattedTrace } from "./stack-trace-types.js";

const LIBRARY_PREFIXES = ['System.', 'Microsoft.', 'mscorlib'];

function classifyFrame(trimmed: string): 'frame-app' | 'frame-library' {
  // Generic-type frames render as "List`1.get_Item(...)" at runtime — backtick must stay in the class.
  const member = trimmed.match(/^at\s+([\w.`]+)\(/)?.[1] ?? '';
  return LIBRARY_PREFIXES.some((prefix) => member.startsWith(prefix)) ? 'frame-library' : 'frame-app';
}

/** Formats a .NET stack trace, tagging BCL/framework frames as library frames and inner-exception markers as causes. */
export function formatDotNetStackTrace(text: string): FormattedTrace {
  const lines: FormattedLine[] = text.split('\n').map((rawLine) => {
    const line = rawLine.replace(/\r$/, '');
    const trimmed = line.trim();

    if (/^at\s+/.test(trimmed)) return { text: line, kind: classifyFrame(trimmed) };
    if (/^--->/.test(trimmed) || /^--- End of inner exception stack trace ---$/.test(trimmed)) return { text: line, kind: 'cause' };
    return { text: line, kind: 'header' };
  });

  return { lines };
}
