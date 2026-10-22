/** The AbortError shape used by the off-thread runner and every consumer that treats a cancelled run as "not an error". */
export function abortError(): Error { const error = new Error('The operation was aborted.'); error.name = 'AbortError'; return error; }
export function isAbortError(error: unknown): boolean { return error instanceof Error && error.name === 'AbortError'; }
