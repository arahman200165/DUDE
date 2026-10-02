import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs';
import path from 'node:path';

export interface HubLoggerOptions {
  level: string;
  redact: { paths: string[]; censor: string };
  serializers: Record<string, (value: unknown) => unknown>;
  stream: { write(chunk: string): void };
}

export interface HubLogStream {
  write(chunk: string): void;
  close(): void;
}

/**
 * Synchronous log sink: append to `logs/hub.log` (and stdout in the foreground). No pino transports, so no
 * worker threads and nothing that breaks esbuild/SEA bundling.
 */
export function createLogStream(logFile: string, options: { stdout?: boolean } = {}): HubLogStream {
  mkdirSync(path.dirname(logFile), { recursive: true });
  const fd = openSync(logFile, 'a');
  let closed = false;
  return {
    write(chunk: string): void {
      if (closed) return;
      try { writeSync(fd, chunk); } catch { /* logging must never crash the Hub */ }
      if (options.stdout) {
        try { process.stdout.write(chunk); } catch { /* ignore */ }
      }
    },
    close(): void {
      if (closed) return;
      closed = true;
      try { closeSync(fd); } catch { /* ignore */ }
    },
  };
}

/** Serializers log method, URL path (no query string) and status only: never headers or bodies. */
export function hubLoggerOptions(stream: { write(chunk: string): void }, env: Record<string, string | undefined> = process.env): HubLoggerOptions {
  return {
    level: env['DUDE_HUB_LOG_LEVEL']?.trim() || 'info',
    redact: { paths: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'], censor: '[redacted]' },
    serializers: {
      req: (value) => {
        const req = value as { method?: string; url?: string; id?: string };
        return { method: req.method, url: req.url?.split('?')[0], reqId: req.id };
      },
      res: (value) => ({ statusCode: (value as { statusCode?: number }).statusCode }),
    },
    stream,
  };
}
