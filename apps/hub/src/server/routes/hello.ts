import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { HUB_API_PREFIX, HUB_MIN_CLIENT_PROTOCOL, HUB_PROTOCOL_VERSION, HUB_SERVICE_ID, HelloResponse, isPublicCaDomain } from '@dude/contracts/hub';
import type { Db } from '@dude/sqlite-store';
import { getAuthorityEpoch, getAuthorityState } from '../../hub/authority.js';
import { proxyPinSpkis } from '../../tls/proxy-pins.js';

export interface HelloRouteOptions {
  db: Db;
  hubInstanceId: string;
  hubVersion: string;
  spkiSha256: string;
  /**
   * The managed tunnel's host name while tunnel mode is on (32-SS1, Milestone 838): the hello then advertises `trustMode: 'public-ca'` with this
   * `trustDomain`, because the public edge presents a CA-issued certificate DUDE does not control. Omitted otherwise (the hello stays byte-for-byte
   * the pre-838 shape for a pinned Hub).
   */
  tunnelHostname?: string;
}

/** Credential type: none. Reveals only service identity, versions and public pins. */
export function registerHelloRoute(app: FastifyInstance, options: HelloRouteOptions): void {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    `${HUB_API_PREFIX}/hello`,
    { schema: { response: { 200: HelloResponse } } },
    async (_request, reply) => {
      const environment = options.db.prepare('SELECT environment_id FROM environment LIMIT 1').get() as { environment_id: string } | undefined;
      const owner = options.db.prepare('SELECT 1 AS x FROM owner LIMIT 1').get();
      const next = options.db.prepare("SELECT spki_sha256 FROM tls_pins WHERE state = 'next' LIMIT 1").get() as { spki_sha256: string } | undefined;
      const active = options.db.prepare("SELECT spki_sha256 FROM tls_pins WHERE state = 'active' LIMIT 1").get() as { spki_sha256: string } | undefined;
      void reply.header('Cache-Control', 'no-store');
      const trustDomain = options.tunnelHostname?.toLowerCase();
      const advertise = trustDomain !== undefined && isPublicCaDomain(trustDomain);
      return {
        service: HUB_SERVICE_ID,
        protocolVersion: HUB_PROTOCOL_VERSION,
        minClientProtocol: HUB_MIN_CLIENT_PROTOCOL,
        hubVersion: options.hubVersion,
        hubInstanceId: options.hubInstanceId,
        environmentId: environment?.environment_id ?? null,
        bootstrapped: owner !== undefined,
        syncCategoryFiltering: true,
        tls: { spkiSha256: active?.spki_sha256 ?? options.spkiSha256, nextSpkiSha256: next?.spki_sha256 ?? null, proxySpkiSha256: proxyPinSpkis(options.db) },
        authorityEpoch: getAuthorityEpoch(options.db),
        authorityState: getAuthorityState(options.db),
        ...(advertise ? { trustMode: 'public-ca' as const, trustDomain } : {}),
      } as const;
    },
  );
}
