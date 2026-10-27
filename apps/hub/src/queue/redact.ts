/** Longest stored failure note (`jobs.last_error`, `GET /api/v1/queue`). */
export const JOB_ERROR_MAX = 300;

/** A payload key that looks like a credential is refused at enqueue: a queued row is readable by anyone who can read the database. */
export const SECRET_KEY_PATTERN = /pass|secret|token|credential|authorization|cookie|api[-_]?key|private[-_]?key|csrf/i;

/**
 * Turns an error (or its message) into a short, one-line, credential-free note. Absolute paths, bearer tokens, `key=value`
 * pairs with a secret-looking key and any long token-like run are replaced, then the text is cut to `JOB_ERROR_MAX`. It runs
 * before anything is stored, so `jobs.last_error` can never hold more than this.
 */
export function redactJobError(error: unknown): string {
  const raw = error instanceof Error ? error.message : typeof error === 'string' ? error : 'The job failed.';
  const cleaned = raw
    .replace(/\s+/g, ' ')
    .replace(/Bearer\s+\S+/gi, 'Bearer <redacted>')
    .replace(/\b([\w.-]*(?:pass|secret|token|key|credential|authorization|cookie)[\w.-]*)\s*[=:]\s*\S+/gi, '$1=<redacted>')
    .replace(/[A-Za-z]:[\\/][^\s'"`<>|]*/g, '<path>')
    .replace(/(?:^|(?<=[\s'"`(=]))\/(?:[\w.@~-]+\/)+[\w.@~-]*/g, '<path>')
    .replace(/[A-Za-z0-9+/_-]{32,}={0,2}/g, '<redacted>')
    .trim();
  const text = cleaned.length > 0 ? cleaned : 'The job failed.';
  return text.length <= JOB_ERROR_MAX ? text : `${text.slice(0, JOB_ERROR_MAX - 3)}...`;
}

/** Throws when `payload` has a secret-looking key at any depth, is not JSON-serializable or is larger than `maxBytes` serialized. */
export function assertQueuePayload(payload: unknown, maxBytes: number): string {
  const visit = (value: unknown, depth: number): void => {
    if (depth > 8) throw new Error('A job payload is nested too deeply.');
    if (typeof value !== 'object' || value === null) return;
    for (const [key, child] of Object.entries(value)) {
      if (SECRET_KEY_PATTERN.test(key)) throw new Error(`Job payload key "${key}" looks like a credential and is not allowed.`);
      visit(child, depth + 1);
    }
  };
  visit(payload, 0);
  const json = JSON.stringify(payload ?? {}) as string | undefined;
  if (json === undefined) throw new Error('A job payload must be JSON.');
  if (Buffer.byteLength(json) > maxBytes) throw new Error(`A job payload is limited to ${maxBytes} bytes.`);
  return json;
}
