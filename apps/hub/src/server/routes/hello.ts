import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { HUB_API_PREFIX, HUB_MIN_CLIENT_PROTOCOL, HUB_PROTOCOL_VERSION, HUB_SERVICE_ID, HelloResponse } from '@dude/contracts/hub';
import type { Db } from '@dude/sqlite-store';

export interface HelloRouteOptions {
  db: Db;
  hubInstanceId: string;
  hubVersion: string;
  spkiSha256: string;
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
      return {
        service: HUB_SERVICE_ID,
        protocolVersion: HUB_PROTOCOL_VERSION,
        minClientProtocol: HUB_MIN_CLIENT_PROTOCOL,
        hubVersion: options.hubVersion,
        hubInstanceId: options.hubInstanceId,
        environmentId: environment?.environment_id ?? null,
        bootstrapped: owner !== undefined,
        tls: { spkiSha256: active?.spki_sha256 ?? options.spkiSha256, nextSpkiSha256: next?.spki_sha256 ?? null },
      } as const;
    },
  );
}
