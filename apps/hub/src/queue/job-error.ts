/** A handler throws this when retrying cannot help (a malformed payload, a missing source): the job ends `failed` without retry. */
export class PermanentJobError extends Error {
  override readonly name = 'PermanentJobError';
}

/** The attempt was cut short by the runner (timeout, lost lease, shutdown). `retryable` decides whether the queue retries it. */
export class JobAbortedError extends Error {
  override readonly name = 'JobAbortedError';
  constructor(message: string, readonly reason: 'timeout' | 'lease-lost' | 'shutdown') {
    super(message);
  }
}
