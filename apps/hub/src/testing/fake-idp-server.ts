import http from 'node:http';
import { createFakeIdp } from '../auth/oidc/fake-idp.js';
import type { FakeAccount, FakeIdpFailure, FakeIdpPart } from '../auth/oidc/fake-idp.js';
import { FAKE_IDP_DOWN_STATUS, FAKE_IDP_URL_HEADER } from '../auth/oidc/test-idp-forward.js';

/**
 * The fake OpenID provider as a loopback HTTP server (32-SS1 platform exit e2e, Milestone 854): the in-process `createFakeIdp` behind a
 * socket, so a REAL Hub process (`DUDE_HUB_TEST_OIDC_IDP_URL`) and the test that plays the browser can both talk to the same provider.
 * Built to `dist/hub-test/fake-idp-server.cjs` by `npm run hub:compile:test`; never part of a release bundle.
 *
 *   ANY /fetch     what the Hub's OIDC client sends (`x-fake-idp-url` names the URL it asked for): answered by `idp.fetch`, or 599 when "down".
 *   POST /control  JSON `{ op, ... }`: `authorize { authorizationUrl, account? }`, `account { account }`, `failure { mode }` (omit to clear),
 *                  `claims { claims }`, `down { part, down }`, `rotateKey { retire? }`, `calls`, `tokenBodies`.
 *
 * Usage: `node fake-idp-server.cjs [--client-id <id>] [--client-secret <secret>]`. Prints one JSON line, `{"event":"listening","url":"http://127.0.0.1:<port>",
 * "issuer","clientId","clientSecret"}`, and runs until it is terminated.
 */
function flag(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

const readBody = (request: http.IncomingMessage): Promise<Buffer> => new Promise((resolve, reject) => {
  const chunks: Buffer[] = [];
  request.on('data', (chunk: Buffer) => chunks.push(chunk));
  request.on('end', () => resolve(Buffer.concat(chunks)));
  request.on('error', reject);
});

async function main(): Promise<void> {
  const clientId = flag('--client-id');
  const clientSecret = flag('--client-secret');
  const idp = await createFakeIdp({ ...(clientId !== undefined ? { clientId } : {}), ...(clientSecret !== undefined ? { clientSecret } : {}) });

  const server = http.createServer((request, response) => {
    void (async () => {
      const body = await readBody(request);
      if (request.url === '/fetch') {
        const url = request.headers[FAKE_IDP_URL_HEADER];
        const headers: Record<string, string> = {};
        for (const [name, value] of Object.entries(request.headers)) {
          if (typeof value === 'string' && !['host', 'connection', 'content-length', 'transfer-encoding', FAKE_IDP_URL_HEADER].includes(name)) headers[name] = value;
        }
        try {
          const answer = await idp.fetch(String(url), { method: request.method ?? 'GET', headers, ...(body.length > 0 ? { body: body.toString('utf8') } : {}) });
          const out: Record<string, string> = {};
          answer.headers.forEach((value, name) => { out[name] = value; });
          response.writeHead(answer.status, out);
          response.end(Buffer.from(await answer.arrayBuffer()));
        } catch {
          response.writeHead(FAKE_IDP_DOWN_STATUS);
          response.end();
        }
        return;
      }
      if (request.method === 'POST' && request.url === '/control') {
        const input = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
        let result: unknown = { ok: true };
        switch (input['op']) {
          case 'authorize': result = idp.authorize(String(input['authorizationUrl']), input['account'] === undefined ? {} : { account: input['account'] as FakeAccount }); break;
          case 'account': idp.account = input['account'] as FakeAccount; break;
          case 'failure': idp.setFailure(input['mode'] as FakeIdpFailure | undefined); break;
          case 'claims': idp.setClaims(input['claims'] as Record<string, unknown>); break;
          case 'down': idp.setDown(input['part'] as FakeIdpPart | 'all', input['down'] === true); break;
          case 'rotateKey': result = { kid: await idp.rotateKey(input['retire'] === true ? { retire: true } : {}) }; break;
          case 'calls': result = idp.calls; break;
          case 'tokenBodies': result = idp.tokenRequestBodies; break;
          default: response.writeHead(400); response.end(); return;
        }
        response.writeHead(200, { 'content-type': 'application/json' });
        response.end(JSON.stringify(result));
        return;
      }
      response.writeHead(404);
      response.end();
    })().catch((error: unknown) => {
      response.writeHead(500, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: error instanceof Error ? error.message : 'failed' }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  process.stdout.write(`${JSON.stringify({ event: 'listening', url: `http://127.0.0.1:${port}`, issuer: idp.issuer, clientId: idp.clientId, clientSecret: idp.clientSecret })}\n`);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => { server.close(); process.exit(0); });
}

void main();
