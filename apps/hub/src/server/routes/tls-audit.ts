import { X509Certificate } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Db } from '@dude/sqlite-store';
import { AUDIT_LIST_DEFAULT_LIMIT, AUDIT_LIST_MAX_LIMIT, AuditListQuery, AuditListResponse, ErrorEnvelope, HUB_API_PREFIX, TlsCertificatesResponse } from '@dude/contracts/hub';
import type { createRequireOwner } from '../../auth/owner-auth.js';
import { envelope } from '../errors.js';
import { listAudit } from '../../security/audit.js';
import { describeCertificateSource } from '../../tls/ca-public.js';

export interface TlsAuditRouteOptions { db: Db; tlsDir: string; requireOwner: ReturnType<typeof createRequireOwner> }

/** `GET /tls/certificates`: no credential (public pins). `GET /audit`: owner only. */
export function registerTlsAuditRoutes(app: FastifyInstance, options: TlsAuditRouteOptions): void {
  const { db } = options;
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();

  typed.get(
    `${HUB_API_PREFIX}/tls/certificates`,
    { config: { authLimited: true, credentialless: true }, schema: { response: { 200: TlsCertificatesResponse, 404: ErrorEnvelope } } },
    async (_request, reply) => {
      void reply.header('Cache-Control', 'no-store');
      const rows = db.prepare("SELECT spki_sha256, cert_pem, state FROM tls_pins WHERE state IN ('active', 'next')").all() as unknown as Array<{ spki_sha256: string; cert_pem: string; state: string }>;
      const pick = (state: string) => {
        const row = rows.find((r) => r.state === state);
        return row ? { spkiSha256: row.spki_sha256, certPem: row.cert_pem } : null;
      };
      const active = pick('active');
      if (!active) return reply.code(404).send(envelope('not-found', 'No active certificate.'));
      // Public data only: the root certificate, never a key (this module must not import the CA key protector).
      const { source, caCertPem } = describeCertificateSource(options.tlsDir, active.certPem);
      return reply.code(200).send({ active, next: pick('next'), source, caCertPem, leafNotAfter: new Date(new X509Certificate(active.certPem).validTo).toISOString() });
    },
  );

  typed.get(
    `${HUB_API_PREFIX}/audit`,
    { preHandler: options.requireOwner, schema: { querystring: AuditListQuery, response: { 200: AuditListResponse, 401: ErrorEnvelope, 403: ErrorEnvelope } } },
    async (request, reply) => {
      void reply.header('Cache-Control', 'no-store');
      const limit = Math.min(AUDIT_LIST_MAX_LIMIT, request.query.limit !== undefined ? Number(request.query.limit) : AUDIT_LIST_DEFAULT_LIMIT);
      const records = listAudit(db, { limit, ...(request.query.beforeSeq !== undefined ? { beforeSeq: Number(request.query.beforeSeq) } : {}) });
      const last = records[records.length - 1];
      const events = records.map((r) => ({ ...r, detail: (r.detail ?? null) as Record<string, unknown> | null }));
      return reply.code(200).send({ events, nextBeforeSeq: records.length === limit && last ? last.seq : null });
    },
  );
}
