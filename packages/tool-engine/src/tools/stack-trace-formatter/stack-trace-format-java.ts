import { FormattedLine, FormattedTrace } from "./stack-trace-types.js";

const LIBRARY_PREFIXES = ['java.', 'javax.', 'sun.', 'jdk.', 'kotlin.', 'scala.', 'org.springframework.', 'com.google.', 'org.junit.'];

function classifyFrame(trimmed: string): 'frame-app' | 'frame-library' {
  // Java 9+ module-path frames look like "at java.base/java.util.ArrayList.get(...)" — skip the module prefix.
  const className = trimmed.match(/^at\s+(?:[\w.]+\/)?([\w$.<>]+)\(/)?.[1] ?? '';
  return LIBRARY_PREFIXES.some((prefix) => className.startsWith(prefix)) ? 'frame-library' : 'frame-app';
}

/** Formats a JVM (Java/Kotlin) stack trace, tagging JDK/common-framework frames as library frames. */
export function formatJavaStackTrace(text: string): FormattedTrace {
  const lines: FormattedLine[] = text.split('\n').map((rawLine) => {
    const line = rawLine.replace(/\r$/, '');
    const trimmed = line.trim();

    if (/^at\s+/.test(trimmed)) return { text: line, kind: classifyFrame(trimmed) };
    if (/^Caused by:/.test(trimmed)) return { text: line, kind: 'cause' };
    if (/^\.\.\.\s*\d+\s*more$/.test(trimmed)) return { text: line, kind: 'other' };
    return { text: line, kind: 'header' };
  });

  return { lines };
}
