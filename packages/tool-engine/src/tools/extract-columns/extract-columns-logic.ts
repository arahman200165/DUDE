export interface ExtractColumnsOptions {
  readonly delimiter: string;
  readonly columnSpec: string;
  readonly outputDelimiter: string;
}

/** Expands "\t"/"\n" escape sequences a user might type for a delimiter into the real character. */
export function resolveDelimiter(raw: string): string {
  return raw.replace(/\\t/g, '\t').replace(/\\n/g, '\n');
}

/** Parses a 1-indexed column selector like "1,3-5,2" into an ordered list of column indices (duplicates/order preserved). */
export function parseColumnSpec(spec: string): readonly number[] {
  const indices: number[] = [];

  for (const part of spec.split(',')) {
    const token = part.trim();
    if (token === '') continue;

    const rangeMatch = /^(\d+)-(\d+)$/.exec(token);
    if (rangeMatch) {
      const start = Number(rangeMatch[1]);
      const end = Number(rangeMatch[2]);
      const step = start <= end ? 1 : -1;
      for (let i = start; step > 0 ? i <= end : i >= end; i += step) indices.push(i);
      continue;
    }

    const n = Number(token);
    if (Number.isInteger(n) && n > 0) indices.push(n);
  }

  return indices;
}

export function extractColumns(text: string, options: ExtractColumnsOptions): string {
  const delimiter = resolveDelimiter(options.delimiter);
  const outputDelimiter = resolveDelimiter(options.outputDelimiter);
  const columns = parseColumnSpec(options.columnSpec);

  if (delimiter === '' || columns.length === 0) return text;

  return text
    .split('\n')
    .map((line) => {
      const fields = line.split(delimiter);
      return columns.map((i) => fields[i - 1] ?? '').join(outputDelimiter);
    })
    .join('\n');
}
