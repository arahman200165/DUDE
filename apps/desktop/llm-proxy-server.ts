import { createServer, type Server } from 'node:http';

/**
 * A minimal loopback HTTP proxy (Phase 8 Stage 4) that forwards a chat
 * request to the user's configured OpenAI-compatible endpoint, injecting
 * the API key server-side so it never reaches the renderer/devtools. Bound
 * to `127.0.0.1` on an OS-assigned port, same pattern as `static-server.ts`.
 *
 * Deliberately non-streaming: the proxy is a dumb pass-through (auth
 * injection + JSON forwarding) rather than an SSE relay, since Regex
 * Tester's AI features (explain / generate-from-natural-language) only need
 * a short, complete response, not token-by-token streaming. Streaming could
 * be a fast-follow if a future feature needs it.
 */

export interface LlmProxyConfig {
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: string;
}

interface ChatMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

function readJsonBody(req: import('node:http').IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(chunks.length === 0 ? {} : JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

export function startLlmProxy(config: LlmProxyConfig): Promise<{ server: Server; port: number }> {
  const server = createServer((req, res) => {
    void (async () => {
      if (req.method !== 'POST' || req.url !== '/v1/chat') {
        res.writeHead(404, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Not found' }));
        return;
      }

      let body: unknown;
      try {
        body = await readJsonBody(req);
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'Invalid JSON body' }));
        return;
      }

      const messages = (body as { messages?: readonly ChatMessage[] })?.messages;
      if (!Array.isArray(messages) || messages.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: 'A non-empty "messages" array is required.' }));
        return;
      }

      try {
        const upstream = await fetch(`${config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${config.apiKey}`,
          },
          body: JSON.stringify({ model: config.model, messages, stream: false }),
        });

        const text = await upstream.text();
        res.writeHead(upstream.status, { 'Content-Type': 'application/json' }).end(text);
      } catch (error) {
        res
          .writeHead(502, { 'Content-Type': 'application/json' })
          .end(JSON.stringify({ error: error instanceof Error ? error.message : 'The upstream LLM endpoint could not be reached.' }));
      }
    })();
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('LLM proxy did not bind to a TCP port'));
        return;
      }
      resolve({ server, port: address.port });
    });
  });
}
