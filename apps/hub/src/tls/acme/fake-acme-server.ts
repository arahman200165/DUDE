/**
 * In-process fake ACME server for specs (loopback, plain HTTP). Not imported by production code.
 *
 * Implements directory, new-nonce, new-account, new-order, authz, challenge, finalize, order and cert
 * closely enough to exercise the client: it verifies ES256 JWS signatures (jwk on newAccount, kid after),
 * consumes nonces once, validates http-01 by really fetching the challenge from a resolver-mapped address,
 * verifies the CSR and signs a leaf with a throwaway CA.
 */
import { createPublicKey, generateKeyPairSync, randomBytes, verify } from 'node:crypto';
import type { KeyObject } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { sequence } from '../der-writer.js';
import { OID, authorityKeyIdentifierValue, basicConstraintsValue, buildCertificate, extension, generalName, pemEncode, skiFromSpki, skiOfKey } from '../x509.js';
import { verifyCsr } from './csr.js';
import { jwkThumbprint } from './jws.js';
import type { EcJwk } from './jws.js';

export interface FakeAcmeOptions {
  /** Maps a challenge domain to where its http-01 listener really is (default: 127.0.0.1:80). */
  resolve?: (domain: string) => { host: string; port: number };
}

export interface FakeAcmeServer {
  readonly url: string;
  readonly directoryUrl: string;
  /** PEM of the throwaway CA. */
  readonly caPem: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  /** The next `count` signed POSTs are answered with badNonce (plus a fresh nonce). */
  injectBadNonce(count?: number): void;
  /** Challenge validation reports the authorization invalid. */
  rejectChallenges: boolean;
  /** newOrder answers 429 rateLimited with `Retry-After: <seconds>`. */
  rateLimited: number | null;
  /** Offer only dns-01 challenges (no http-01). */
  dnsOnly: boolean;
  /** Creating an account without termsOfServiceAgreed fails with userActionRequired (always enforced; this flag adds a ToS URL). */
  tosRequired: boolean;
  /** The order reports `processing` for this many polls after finalize. */
  orderProcessingPolls: number;
  /** An authorization stays `pending` for this many polls after the challenge validated. */
  authzPendingPolls: number;
  /** Every request seen: `${method} ${path}`. */
  readonly requests: string[];
  /** Account JWKs by kid. */
  readonly accounts: Map<string, EcJwk>;
  /** The CSR names of every finalize. */
  readonly finalizedNames: string[][];
}

interface AuthzState { id: string; domain: string; token: string; status: 'pending' | 'valid' | 'invalid'; validating: boolean; pollsLeft: number; challengeStatus: string; error?: { type: string; detail: string }; orderId: string; accountKid: string }
interface OrderState { id: string; names: string[]; authzIds: string[]; status: 'pending' | 'ready' | 'processing' | 'valid' | 'invalid'; pollsLeft: number; cert?: string; accountKid: string }

const problem = (type: string, detail: string, status: number) => ({ status, body: { type: `urn:ietf:params:acme:error:${type}`, detail } });

export function createFakeAcmeServer(options: FakeAcmeOptions = {}): FakeAcmeServer {
  const resolve = options.resolve ?? (() => ({ host: '127.0.0.1', port: 80 }));
  const { privateKey: caKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const caSpki = createPublicKey(caKey).export({ type: 'spki', format: 'der' });
  const caCert = buildCertificate({
    subjectCn: 'Fake ACME Root',
    issuerCn: 'Fake ACME Root',
    spki: caSpki,
    notBefore: new Date(Date.now() - 86_400_000),
    notAfter: new Date(Date.now() + 3650 * 86_400_000),
    extensions: [extension(OID.basicConstraints, true, basicConstraintsValue(true)), extension(OID.subjectKeyIdentifier, false, Buffer.concat([Buffer.from([0x04, 20]), skiOfKey(caKey)]))],
    signerKey: caKey,
  });

  const nonces = new Set<string>();
  const authzs = new Map<string, AuthzState>();
  const orders = new Map<string, OrderState>();
  const accounts = new Map<string, EcJwk>();
  let badNonces = 0;
  let base = '';
  let server: http.Server | null = null;

  const state: FakeAcmeServer = {
    get url() { return base; },
    get directoryUrl() { return `${base}/directory`; },
    caPem: pemEncode('CERTIFICATE', caCert),
    rejectChallenges: false,
    rateLimited: null,
    dnsOnly: false,
    tosRequired: false,
    orderProcessingPolls: 0,
    authzPendingPolls: 0,
    requests: [],
    accounts,
    finalizedNames: [],
    injectBadNonce(count = 1) { badNonces += count; },
    start: async () => {
      const created = http.createServer((req, res) => { void handle(req, res); });
      server = created;
      await new Promise<void>((ok) => created.listen(0, '127.0.0.1', ok));
      base = `http://127.0.0.1:${(created.address() as AddressInfo).port}`;
    },
    stop: async () => {
      const current = server;
      server = null;
      if (!current) return;
      await new Promise<void>((ok) => { current.close(() => ok()); current.closeAllConnections(); });
    },
  };

  const freshNonce = (): string => {
    const value = randomBytes(12).toString('base64url');
    nonces.add(value);
    return value;
  };

  function send(res: http.ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}): void {
    const isText = typeof body === 'string';
    const payload = body === undefined ? '' : isText ? body : JSON.stringify(body);
    res.writeHead(status, {
      'Replay-Nonce': freshNonce(),
      'Cache-Control': 'no-store',
      ...(body !== undefined ? { 'Content-Type': isText ? 'application/pem-certificate-chain' : status >= 400 ? 'application/problem+json' : 'application/json' } : {}),
      Connection: 'close',
      ...headers,
    });
    res.end(payload);
  }

  async function readBody(req: http.IncomingMessage): Promise<string> {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf8');
  }

  function authzJson(a: AuthzState) {
    const challenges = state.dnsOnly
      ? [{ type: 'dns-01', url: `${base}/chall/${a.id}`, token: a.token, status: 'pending' }]
      : [{ type: 'http-01', url: `${base}/chall/${a.id}`, token: a.token, status: a.challengeStatus, ...(a.error ? { error: a.error } : {}) }];
    return { status: a.status, identifier: { type: 'dns', value: a.domain }, challenges };
  }

  function orderJson(o: OrderState) {
    return {
      status: o.status,
      identifiers: o.names.map((value) => ({ type: 'dns', value })),
      authorizations: o.authzIds.map((id) => `${base}/authz/${id}`),
      finalize: `${base}/finalize/${o.id}`,
      ...(o.status === 'valid' ? { certificate: `${base}/cert/${o.id}` } : {}),
    };
  }

  function refreshOrder(o: OrderState): void {
    if (o.status === 'pending') {
      const all = o.authzIds.map((id) => authzs.get(id)!);
      if (all.some((a) => a.status === 'invalid')) o.status = 'invalid';
      else if (all.every((a) => a.status === 'valid')) o.status = 'ready';
    }
  }

  async function validate(a: AuthzState, thumbprint: string): Promise<void> {
    const target = resolve(a.domain);
    try {
      const body = await new Promise<string>((ok, fail) => {
        const request = http.get({ host: target.host, port: target.port, path: `/.well-known/acme-challenge/${a.token}`, headers: { Host: a.domain }, agent: false }, (response) => {
          if (response.statusCode !== 200) { response.resume(); fail(new Error(`HTTP ${response.statusCode}`)); return; }
          const parts: Buffer[] = [];
          response.on('data', (c: Buffer) => parts.push(c));
          response.on('end', () => ok(Buffer.concat(parts).toString('utf8')));
        });
        request.on('error', fail);
        request.setTimeout(5000, () => request.destroy(new Error('timeout')));
      });
      if (state.rejectChallenges) throw new Error('rejected by switch');
      if (body.trim() !== `${a.token}.${thumbprint}`) throw new Error('key authorization mismatch');
      a.challengeStatus = 'valid';
      a.status = 'valid';
    } catch (error) {
      a.challengeStatus = 'invalid';
      a.status = 'invalid';
      a.error = { type: 'urn:ietf:params:acme:error:unauthorized', detail: `Could not validate ${a.domain}: ${(error as Error).message}` };
    }
  }

  function signLeaf(names: string[], spki: Buffer): string {
    const leaf = buildCertificate({
      subjectCn: names[0]!,
      issuerCn: 'Fake ACME Root',
      spki,
      notBefore: new Date(Date.now() - 60_000),
      notAfter: new Date(Date.now() + 90 * 86_400_000),
      extensions: [
        extension(OID.subjectAltName, false, sequence(...names.map(generalName))),
        extension(OID.basicConstraints, true, basicConstraintsValue(false)),
        extension(OID.authorityKeyIdentifier, false, authorityKeyIdentifierValue(skiFromSpki(caSpki))),
      ],
      signerKey: caKey,
    });
    return pemEncode('CERTIFICATE', leaf) + pemEncode('CERTIFICATE', caCert);
  }

  async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const path = new URL(req.url ?? '/', 'http://x').pathname;
    const method = req.method ?? 'GET';
    state.requests.push(`${method} ${path}`);
    try {
      if (method === 'GET' && path === '/directory') {
        return send(res, 200, { newNonce: `${base}/new-nonce`, newAccount: `${base}/new-account`, newOrder: `${base}/new-order`, meta: state.tosRequired ? { termsOfService: `${base}/tos` } : {} });
      }
      if ((method === 'HEAD' || method === 'GET') && path === '/new-nonce') {
        return send(res, method === 'HEAD' ? 200 : 204, undefined);
      }
      if (method !== 'POST') return send(res, 405, problem('malformed', 'method not allowed', 405).body);

      // ---- JWS verification ----
      const raw = JSON.parse(await readBody(req)) as { protected?: string; payload?: string; signature?: string };
      const header = JSON.parse(Buffer.from(raw.protected ?? '', 'base64url').toString('utf8')) as { alg?: string; nonce?: string; url?: string; jwk?: EcJwk; kid?: string };
      const fail = (p: { status: number; body: unknown }, headers?: Record<string, string>) => send(res, p.status, p.body, headers);
      if (badNonces > 0) { badNonces--; return fail(problem('badNonce', 'injected bad nonce', 400)); }
      if (!header.nonce || !nonces.delete(header.nonce)) return fail(problem('badNonce', 'unknown or reused nonce', 400));
      if (header.alg !== 'ES256') return fail(problem('badSignatureAlgorithm', 'only ES256', 400));
      if (header.url !== `${base}${path}`) return fail(problem('unauthorized', 'url header mismatch', 401));
      if (!!header.jwk === !!header.kid) return fail(problem('malformed', 'exactly one of jwk and kid', 400));
      const accountJwk = header.jwk ?? accounts.get(header.kid!);
      if (!accountJwk) return fail(problem('accountDoesNotExist', 'unknown account', 400));
      const key: KeyObject = createPublicKey({ key: accountJwk, format: 'jwk' });
      const signed = Buffer.from(`${raw.protected}.${raw.payload ?? ''}`, 'ascii');
      if (!verify('sha256', signed, { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(raw.signature ?? '', 'base64url'))) return fail(problem('malformed', 'bad signature', 400));
      const payload: Record<string, unknown> | null = raw.payload ? (JSON.parse(Buffer.from(raw.payload, 'base64url').toString('utf8')) as Record<string, unknown>) : null;
      const kid = header.kid ?? '';
      const thumbprint = jwkThumbprint(accountJwk);

      if (path === '/new-account') {
        const existing = [...accounts.entries()].find(([, v]) => jwkThumbprint(v) === thumbprint);
        if (existing) return send(res, 200, { status: 'valid' }, { Location: existing[0] });
        if (payload?.onlyReturnExisting) return fail(problem('accountDoesNotExist', 'no account for this key', 400));
        if (payload?.termsOfServiceAgreed !== true) return fail(problem('userActionRequired', 'must agree to the terms of service', 403));
        const location = `${base}/acct/${randomBytes(6).toString('hex')}`;
        accounts.set(location, accountJwk);
        return send(res, 201, { status: 'valid', contact: payload.contact ?? [] }, { Location: location });
      }
      if (!header.kid) return fail(problem('malformed', 'kid required', 400));

      if (path === '/new-order') {
        if (state.rateLimited !== null) return fail(problem('rateLimited', 'too many certificates already issued', 429), { 'Retry-After': String(state.rateLimited) });
        const identifiers = (payload?.identifiers ?? []) as { type: string; value: string }[];
        if (!identifiers.length) return fail(problem('malformed', 'no identifiers', 400));
        const order: OrderState = { id: randomBytes(6).toString('hex'), names: identifiers.map((i) => i.value), authzIds: [], status: 'pending', pollsLeft: 0, accountKid: kid };
        for (const name of order.names) {
          const a: AuthzState = { id: randomBytes(6).toString('hex'), domain: name, token: randomBytes(24).toString('base64url'), status: 'pending', validating: false, pollsLeft: 0, challengeStatus: 'pending', orderId: order.id, accountKid: kid };
          authzs.set(a.id, a);
          order.authzIds.push(a.id);
        }
        orders.set(order.id, order);
        return send(res, 201, orderJson(order), { Location: `${base}/order/${order.id}` });
      }

      const [, kind, id = ''] = path.split('/');
      if (kind === 'authz') {
        const a = authzs.get(id);
        if (!a || a.accountKid !== kid) return fail(problem('malformed', 'unknown authorization', 404));
        if (a.status === 'valid' && a.pollsLeft > 0) {
          a.pollsLeft--;
          return send(res, 200, { ...authzJson(a), status: 'pending' });
        }
        refreshOrder(orders.get(a.orderId)!);
        return send(res, 200, authzJson(a));
      }
      if (kind === 'chall') {
        const a = authzs.get(id);
        if (!a || a.accountKid !== kid) return fail(problem('malformed', 'unknown challenge', 404));
        if (!a.validating) {
          a.validating = true;
          a.pollsLeft = state.authzPendingPolls;
          void validate(a, thumbprint);
        }
        return send(res, 200, { type: 'http-01', url: `${base}/chall/${a.id}`, token: a.token, status: 'processing' });
      }
      if (kind === 'order') {
        const o = orders.get(id);
        if (!o || o.accountKid !== kid) return fail(problem('malformed', 'unknown order', 404));
        refreshOrder(o);
        if (o.status === 'processing') {
          if (o.pollsLeft > 0) o.pollsLeft--;
          else o.status = 'valid';
        }
        return send(res, 200, orderJson(o));
      }
      if (kind === 'finalize') {
        const o = orders.get(id);
        if (!o || o.accountKid !== kid) return fail(problem('malformed', 'unknown order', 404));
        refreshOrder(o);
        if (o.status !== 'ready') return fail(problem('orderNotReady', `order is ${o.status}`, 403));
        let csr;
        try { csr = verifyCsr(Buffer.from(String(payload?.csr ?? ''), 'base64url')); } catch (error) { return fail(problem('badCSR', (error as Error).message, 400)); }
        if ([...csr.names].sort().join(',') !== [...o.names].sort().join(',')) return fail(problem('badCSR', 'CSR names differ from the order identifiers', 400));
        state.finalizedNames.push(csr.names);
        o.cert = signLeaf(csr.names, csr.publicKeySpki);
        o.status = 'processing';
        o.pollsLeft = state.orderProcessingPolls;
        if (o.pollsLeft === 0) o.status = 'valid';
        return send(res, 200, orderJson(o));
      }
      if (kind === 'cert') {
        const o = orders.get(id);
        if (!o?.cert || o.accountKid !== kid) return fail(problem('malformed', 'unknown certificate', 404));
        return send(res, 200, o.cert);
      }
      return fail(problem('malformed', 'unknown endpoint', 404));
    } catch (error) {
      return send(res, 400, problem('malformed', (error as Error).message, 400).body);
    }
  }

  return state;
}
