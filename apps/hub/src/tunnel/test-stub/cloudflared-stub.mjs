// A stand-in for `cloudflared` used by specs only (32-SS1, Milestone 836). It is plain Node (no bundling, no imports from the
// Hub) so a spec can run it as `node cloudflared-stub.mjs tunnel --no-autoupdate --metrics 127.0.0.1:<port> run`.
//
// It listens on the --metrics address and answers GET /ready with 200 (503 until ready), records what it received, and
// misbehaves on request through STUB_* environment variables (never argv, so the real argument list stays exact):
//   STUB_RECORD_FILE       write {argv, env, pid, cwd, startedAt} as JSON here at start (append mode with STUB_RECORD_APPEND=1)
//   STUB_CRASH_AFTER_MS    exit(3) this long after starting
//   STUB_EXIT_NOW          exit immediately with this code, before listening
//   STUB_READY_AFTER_MS    answer 503 on /ready until this long after starting
//   STUB_NEVER_READY       always answer 503 on /ready
//   STUB_PRINT_TOKEN       echo TUNNEL_TOKEN on stdout and stderr (to prove the supervisor scrubs it); `split` writes it in two chunks
//   STUB_SPAM_LINES       write this many lines to stdout (to prove the log buffer is bounded)
//   STUB_FORWARD_LISTEN   (Milestone 837) also listen on this loopback port as the "edge": every request is forwarded over HTTPS to the Hub at
//   STUB_FORWARD_TO       this loopback port, like the real connector does, appending the client address to X-Forwarded-For and setting
//                         X-Forwarded-Proto (as the Cloudflare edge does) and passing every other client header through untouched, so a spec can
//                         prove what the Hub does with forged forwarding headers that arrive through its one trusted hop
import { appendFileSync, writeFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';

const env = process.env;
const argv = process.argv.slice(2);
const startedAt = Date.now();

const metricsIndex = argv.indexOf('--metrics');
const metrics = metricsIndex >= 0 ? argv[metricsIndex + 1] : undefined;
const shapeOk = argv[0] === 'tunnel' && argv.includes('--no-autoupdate') && argv.at(-1) === 'run' && metrics !== undefined && /^127\.0\.0\.1:\d+$/.test(metrics);

if (env.STUB_RECORD_FILE) {
  const record = JSON.stringify({ argv, env, pid: process.pid, cwd: process.cwd(), startedAt, shapeOk });
  if (env.STUB_RECORD_APPEND === '1') appendFileSync(env.STUB_RECORD_FILE, `${record}\n`);
  else writeFileSync(env.STUB_RECORD_FILE, record);
}

if (env.STUB_EXIT_NOW !== undefined) process.exit(Number(env.STUB_EXIT_NOW));
if (!shapeOk) {
  console.error('stub: unexpected arguments');
  process.exit(2);
}

if (env.STUB_PRINT_TOKEN) {
  const token = env.TUNNEL_TOKEN ?? '';
  if (env.STUB_PRINT_TOKEN === 'split') {
    const half = Math.floor(token.length / 2);
    process.stdout.write(`connecting with ${token.slice(0, half)}`);
    setTimeout(() => process.stdout.write(`${token.slice(half)} done\n`), 30);
  } else {
    process.stdout.write(`token=${token}\n`);
  }
  process.stderr.write(`TUNNEL_TOKEN=${token}\n`);
}
for (let i = 0; i < Number(env.STUB_SPAM_LINES ?? 0); i += 1) process.stdout.write(`line ${i}\n`);

const [host, port] = metrics.split(':');
const readyAfter = Number(env.STUB_READY_AFTER_MS ?? 0);
const server = http.createServer((request, response) => {
  if (request.method === 'GET' && request.url === '/ready') {
    const ready = env.STUB_NEVER_READY === undefined && Date.now() - startedAt >= readyAfter;
    response.writeHead(ready ? 200 : 503, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: ready ? 200 : 503, readyConnections: ready ? 1 : 0 }));
    return;
  }
  response.writeHead(404);
  response.end();
});
server.listen(Number(port), host);

if (env.STUB_FORWARD_LISTEN && env.STUB_FORWARD_TO) {
  const edge = http.createServer((request, response) => {
    const headers = { ...request.headers };
    const client = request.socket.remoteAddress ?? '';
    headers['x-forwarded-for'] = headers['x-forwarded-for'] ? `${headers['x-forwarded-for']}, ${client}` : client;
    headers['x-forwarded-proto'] = 'https';
    const upstream = https.request(
      { host: '127.0.0.1', port: Number(env.STUB_FORWARD_TO), path: request.url, method: request.method, headers, rejectUnauthorized: false, servername: 'localhost' },
      (reply) => {
        response.writeHead(reply.statusCode ?? 502, reply.headers);
        reply.pipe(response);
      },
    );
    upstream.on('error', () => {
      response.writeHead(502);
      response.end();
    });
    request.pipe(upstream);
  });
  edge.listen(Number(env.STUB_FORWARD_LISTEN), '127.0.0.1');
}

if (env.STUB_CRASH_AFTER_MS !== undefined) setTimeout(() => process.exit(3), Number(env.STUB_CRASH_AFTER_MS));
