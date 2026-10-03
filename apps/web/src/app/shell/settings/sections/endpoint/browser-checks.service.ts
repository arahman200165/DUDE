import { Injectable, inject } from '@angular/core';
import type { HubDiagnosticsReport } from '@dude/contracts/hub';
import { HUB_ADMIN } from '../../../../core/hub/hub-admin.token';
import {
  assessTrust, clockSkew, matchOrigin, probeRealtime, realtimeUrl,
  type OriginMatch, type RealtimeResult, type ServiceWorkerState, type SkewResult, type SocketLike, type TrustResult,
} from './browser-checks';

export interface BrowserEnvironment {
  readonly isSecureContext: boolean;
  readonly location: Pick<Location, 'origin' | 'protocol' | 'host'>;
  readonly serviceWorker: () => Promise<ServiceWorkerState>;
  readonly openSocket: (url: string) => SocketLike;
  readonly now: () => number;
}

export interface BrowserCheckResults {
  readonly secureContext: boolean;
  readonly origin: string;
  readonly originMatch: OriginMatch;
  readonly trust: TrustResult;
  readonly serviceWorker: ServiceWorkerState;
  readonly realtime: RealtimeResult;
  readonly skew: SkewResult;
  /** Public local-CA root PEM when the Hub signs with a local CA; null otherwise or when it could not be read. */
  readonly rootPem: string | null;
}

/** The real browser: window globals, behind one seam so specs can substitute it. */
export function defaultBrowserEnvironment(): BrowserEnvironment {
  return {
    isSecureContext: globalThis.isSecureContext === true,
    location: globalThis.location,
    serviceWorker: async () => {
      const container = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker;
      if (container === undefined) return { supported: false, controlling: false, registered: false };
      let registered = false;
      try { registered = (await container.getRegistration()) !== undefined; } catch { /* a blocked registration lookup counts as none */ }
      return { supported: true, controlling: container.controller !== null, registered };
    },
    openSocket: (url) => new WebSocket(url) as unknown as SocketLike,
    now: () => Date.now(),
  };
}

/** Gathers the inputs of the pure checks in `browser-checks.ts`. Hub-served web build only; each probe fails soft. */
@Injectable({ providedIn: 'root' })
export class BrowserChecks {
  private readonly hub = inject(HUB_ADMIN);
  /** Overridden in specs. */
  environment: () => BrowserEnvironment = defaultBrowserEnvironment;

  async run(report: HubDiagnosticsReport | null): Promise<BrowserCheckResults> {
    const env = this.environment();
    const serviceWorker = await env.serviceWorker();
    const [realtime, serverDate, rootPem] = await Promise.all([
      probeRealtime(() => env.openSocket(realtimeUrl(env.location)), { now: env.now }),
      this.hub.serverDate?.().catch(() => null) ?? Promise.resolve(null),
      this.readRoot(report),
    ]);
    return {
      secureContext: env.isSecureContext,
      origin: env.location.origin,
      originMatch: matchOrigin(env.location.origin, report),
      trust: assessTrust({ isSecureContext: env.isSecureContext, protocol: env.location.protocol, serviceWorker }),
      serviceWorker,
      realtime,
      skew: clockSkew(serverDate, env.now()),
      rootPem,
    };
  }

  /** The root is public; the route needs no session, so it is read through the same client as every other call. */
  private async readRoot(report: HubDiagnosticsReport | null): Promise<string | null> {
    if (this.hub.tlsCertificates === undefined) return null;
    if (report !== null && report.certificate?.source !== 'local-ca') return null;
    try {
      const certs = await this.hub.tlsCertificates();
      return certs.source === 'local-ca' ? certs.caCertPem : null;
    } catch {
      return null;
    }
  }
}
