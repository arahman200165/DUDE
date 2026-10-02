/** Pure, framework-free Dockerfile parsing, linting, and formatting — hand-rolled since a Dockerfile's grammar is a simple `INSTRUCTION args` line format. */

export interface DockerfileInstruction {
  readonly keyword: string;
  readonly args: string;
  readonly line: number;
}

/** Joins backslash-continued lines into single logical instructions; comments and blank lines are skipped. */
export function parseDockerfile(text: string): readonly DockerfileInstruction[] {
  const rawLines = text.split(/\r?\n/);
  const instructions: DockerfileInstruction[] = [];

  let i = 0;
  while (i < rawLines.length) {
    const lineNumber = i + 1;
    const trimmed = rawLines[i].trim();
    if (trimmed === '' || trimmed.startsWith('#')) {
      i++;
      continue;
    }

    let full = trimmed;
    while (full.endsWith('\\') && i + 1 < rawLines.length) {
      i++;
      full = `${full.slice(0, -1).trim()} ${rawLines[i].trim()}`.trim();
    }

    const match = /^([A-Za-z]+)\s+([\s\S]*)$/.exec(full);
    if (match) instructions.push({ keyword: match[1].toUpperCase(), args: match[2].trim(), line: lineNumber });
    i++;
  }

  return instructions;
}

export interface DockerfileLintIssue {
  readonly line: number;
  readonly message: string;
}

export function lintDockerfile(text: string): readonly DockerfileLintIssue[] {
  const instructions = parseDockerfile(text);
  if (instructions.length === 0) return [];

  const issues: DockerfileLintIssue[] = [];

  const firstMeaningful = instructions.find((instruction) => instruction.keyword !== 'ARG');
  if (firstMeaningful && firstMeaningful.keyword !== 'FROM') {
    issues.push({ line: firstMeaningful.line, message: 'The first instruction (other than ARG) should be FROM.' });
  }

  let hasUser = false;

  for (const instruction of instructions) {
    if (instruction.keyword === 'USER') hasUser = true;

    if (instruction.keyword === 'FROM') {
      const image = instruction.args.split(/\s+/)[0] ?? '';
      if (image.endsWith(':latest')) {
        issues.push({ line: instruction.line, message: `Base image "${image}" is pinned to the floating ":latest" tag — prefer a specific version or digest.` });
      } else if (!image.includes('@sha256') && !/:[^/]+$/.test(image)) {
        issues.push({ line: instruction.line, message: `Base image "${image}" has no tag or digest — defaults to :latest, which is not reproducible.` });
      }
    }

    if (instruction.keyword === 'RUN' && /apt-get\s+install/i.test(instruction.args)) {
      if (!/--no-install-recommends/.test(instruction.args)) {
        issues.push({ line: instruction.line, message: 'apt-get install without --no-install-recommends pulls in extra, usually unneeded packages.' });
      }
      if (!/rm\s+-rf\s+\/var\/lib\/apt\/lists/.test(instruction.args)) {
        issues.push({ line: instruction.line, message: 'apt-get install without cleaning /var/lib/apt/lists/* afterwards bloats this layer.' });
      }
    }

    if (instruction.keyword === 'ADD') {
      const source = instruction.args.split(/\s+/)[0] ?? '';
      const looksArchiveOrUrl = /^https?:\/\//.test(source) || /\.(tar(\.gz|\.bz2)?|tgz|zip)$/i.test(source);
      if (!looksArchiveOrUrl) {
        issues.push({ line: instruction.line, message: 'ADD is used for a plain file/directory — prefer COPY unless you need automatic archive extraction or a remote URL.' });
      }
    }

    if (instruction.keyword === 'EXPOSE') {
      const ports = instruction.args.split(/\s+/).filter((port) => port !== '');
      if (ports.length === 0 || ports.some((port) => !/^\d+(\/(tcp|udp))?$/.test(port))) {
        issues.push({ line: instruction.line, message: `EXPOSE has a missing or non-numeric port: "${instruction.args}".` });
      }
    }
  }

  if (!hasUser) {
    issues.push({ line: instructions[instructions.length - 1].line, message: 'No USER instruction found — the container runs as root by default.' });
  }

  return issues;
}

/** Uppercases each instruction's leading keyword and normalizes the space after it; leaves comments, blank lines, and continuation-line content untouched. */
export function formatDockerfile(text: string): string {
  const lines = text.split(/\r?\n/);
  const output: string[] = [];
  let continuing = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (continuing) {
      output.push(trimmed);
      continuing = trimmed.endsWith('\\');
      continue;
    }

    if (trimmed === '' || trimmed.startsWith('#')) {
      output.push(trimmed);
      continue;
    }

    const match = /^([A-Za-z]+)\s+([\s\S]*)$/.exec(trimmed);
    output.push(match ? `${match[1].toUpperCase()} ${match[2].trim()}` : trimmed);
    continuing = trimmed.endsWith('\\');
  }

  return output.join('\n');
}
