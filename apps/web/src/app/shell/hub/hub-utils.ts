import { DestroyRef, inject, signal } from '@angular/core';
import { HubAdminError } from '../../core/hub/hub-admin.port';

export const MIN_PASSWORD_LENGTH = 12;
export const PASSWORD_HINT = `At least ${MIN_PASSWORD_LENGTH} characters. A few unrelated words make a strong, memorable password.`;

/** A same-app relative path only: starts with one '/', never '//' or '/\', no scheme, no control characters. */
export function safeReturnUrl(raw: unknown, fallback = '/'): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 2048) return fallback;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return fallback;
  return raw;
}

export interface DescribedError {
  readonly code: string;
  readonly message: string;
  readonly retryAfterMs?: number;
}

/** Turns a port failure into user text; `overrides` give a call-specific message per Hub error code. */
export function describeHubError(error: unknown, overrides: Readonly<Record<string, string>> = {}): DescribedError {
  if (!(error instanceof HubAdminError)) return { code: 'unknown', message: 'Something went wrong. Try again.' };
  const override = overrides[error.code];
  if (override !== undefined) return { code: error.code, message: override, retryAfterMs: error.retryAfterMs };
  switch (error.code) {
    case 'locked':
    case 'rate-limited':
      return { code: error.code, message: 'Too many attempts.', retryAfterMs: error.retryAfterMs };
    case 'network':
      return { code: error.code, message: 'The Hub could not be reached. Check that it is running.' };
    case 'unavailable':
      return { code: error.code, message: 'This is not available here.' };
    case 'unauthorized':
      return { code: error.code, message: 'You are not signed in.' };
    default:
      return { code: error.code, message: error.message || 'The Hub rejected that request.', retryAfterMs: error.retryAfterMs };
  }
}

/** Counts down a retry-after window once per second; `seconds()` is 0 when idle. Create in an injection context. */
export class RetryCountdown {
  readonly seconds = signal(0);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  start(ms: number | undefined): void {
    this.stop();
    const total = Math.ceil((ms ?? 0) / 1000);
    if (total <= 0) return;
    this.seconds.set(total);
    this.timer = setInterval(() => {
      const next = this.seconds() - 1;
      this.seconds.set(Math.max(0, next));
      if (next <= 0) this.stop();
    }, 1000);
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.timer = undefined;
  }
}
