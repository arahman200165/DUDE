/**
 * Minimal ACME http-01 responder.
 *
 * It answers ONLY `GET /.well-known/acme-challenge/<token>` with the stored key authorization as
 * `text/plain` and 404 for everything else. It is meant to be bound ONLY for the duration of one
 * issuance (start before the challenge is announced, stop in the `finally` after validation): the Hub
 * never keeps a port-80 listener open. Request line and header limits stay at the Node defaults.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;
const PREFIX = '/.well-known/acme-challenge/';

export interface Http01Listener {
  start(): Promise<{ port: number }>;
  stop(): Promise<void>;
  set(token: string, keyAuthorization: string): void;
  remove(token: string): void;
  /** Number of challenge answers served and when the last one was. */
  stats(): { served: number; lastServedAt: number | null };
}

export function createHttp01Listener({ port, host = '0.0.0.0', now = Date.now }: { port: number; host?: string; now?: () => number }): Http01Listener {
  const answers = new Map<string, string>();
  let served = 0;
  let lastServedAt: number | null = null;
  let server: http.Server | null = null;

  const handler: http.RequestListener = (req, res) => {
    const url = req.url ?? '';
    const token = req.method === 'GET' && url.startsWith(PREFIX) ? url.slice(PREFIX.length) : '';
    const answer = TOKEN.test(token) ? answers.get(token) : undefined;
    if (answer === undefined) {
      res.writeHead(404, { 'Content-Type': 'text/plain', Connection: 'close' });
      res.end('not found');
      return;
    }
    served++;
    lastServedAt = now();
    res.writeHead(200, { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(answer), Connection: 'close' });
    res.end(answer);
  };

  return {
    start() {
      if (server) return Promise.reject(new Error('http-01 listener already started'));
      const created = http.createServer(handler);
      server = created;
      return new Promise((resolve, reject) => {
        created.once('error', (error) => { server = null; reject(error); });
        created.listen(port, host, () => resolve({ port: (created.address() as AddressInfo).port }));
      });
    },
    async stop() {
      const current = server;
      server = null;
      answers.clear();
      if (!current) return;
      await new Promise<void>((resolve) => {
        current.close(() => resolve());
        current.closeAllConnections();
      });
    },
    set(token, keyAuthorization) {
      if (!TOKEN.test(token)) throw new Error('Invalid ACME challenge token');
      answers.set(token, keyAuthorization);
    },
    remove(token) {
      answers.delete(token);
    },
    stats: () => ({ served, lastServedAt }),
  };
}
