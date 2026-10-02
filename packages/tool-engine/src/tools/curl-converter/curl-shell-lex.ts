/**
 * Minimal POSIX-shell-style tokenizer for a single (possibly backslash-line-
 * continued) command invocation. Handles single quotes (fully literal),
 * double quotes (backslash-escapes \" \\ \$ \` inside, everything else
 * literal), unquoted backslash-escapes, and joining lines ending in a
 * trailing backslash. Does NOT perform $VAR / `cmd` / $(cmd) expansion —
 * such sequences are preserved as literal text.
 */
export function tokenizeShellCommand(raw: string): readonly string[] {
  const joined = raw.replace(/\\\r?\n/g, '');
  const tokens: string[] = [];
  let current = '';
  let inToken = false;
  let i = 0;

  const pushCurrent = (): void => {
    if (inToken) {
      tokens.push(current);
      current = '';
      inToken = false;
    }
  };

  while (i < joined.length) {
    const char = joined[i];

    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      pushCurrent();
      i++;
      continue;
    }

    inToken = true;

    if (char === "'") {
      i++;
      while (i < joined.length && joined[i] !== "'") {
        current += joined[i];
        i++;
      }
      i++; // skip the closing quote, if present
      continue;
    }

    if (char === '"') {
      i++;
      while (i < joined.length && joined[i] !== '"') {
        if (joined[i] === '\\' && i + 1 < joined.length && '"\\$`'.includes(joined[i + 1])) {
          current += joined[i + 1];
          i += 2;
        } else {
          current += joined[i];
          i++;
        }
      }
      i++; // skip the closing quote, if present
      continue;
    }

    if (char === '\\' && i + 1 < joined.length) {
      current += joined[i + 1];
      i += 2;
      continue;
    }

    current += char;
    i++;
  }

  pushCurrent();
  return tokens;
}
