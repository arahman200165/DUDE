import Type, { type Static } from 'typebox';

/**
 * Owner read of the managed Cloudflare Tunnel (32-SS1, PD-120, PD-142, PD-143, Milestone 837). Credential: owner cookie or bearer
 * session. Read-only: turning the tunnel on or off, and storing its connector token, are elevated admin-pipe commands
 * (`dude-hub network tunnel on|off|status`), so no route here can widen exposure or accept a secret. The response never carries the
 * connector token, a path or an environment variable; the log tail is bounded and every line is redacted.
 */
export const HUB_TUNNEL_PATH = '/api/v1/tunnel';

/**
 * What the owner must know before the Hub is reachable through Cloudflare. The wizard and the CLI preview show these lines verbatim;
 * they are also recorded in the security architecture. One line each, plain text.
 */
export const HUB_TUNNEL_DISCLOSURE = [
  'Cloudflare terminates TLS at its edge, so Cloudflare can read the traffic between your browsers and devices and this Hub. If that is not acceptable, use direct Public mode instead ("dude-hub network mode public"), which involves no third party.',
  "Cloudflare's own terms and limits apply to the tunnel, including its limits on serving large amounts of non-HTML content and on request sizes; DUDE sends uploads as 8 MiB chunks, well under those limits, but check your Cloudflare plan before moving large media.",
] as const;

/** The exact phrase an operator types to publish the Hub through the tunnel. */
export const HUB_TUNNEL_PHRASE = 'EXPOSE HUB THROUGH CLOUDFLARE';

/**
 * `not-configured` no tunnel in `hub.json`; `stopped` configured but the connector is not running (off, or the Hub just started);
 * `connecting` the connector is starting or restarting; `ready` connected to the Cloudflare edge; `degraded` was ready and stopped
 * answering; `failed` could not start or crashed repeatedly (the cause is `lastError`).
 */
export const HUB_TUNNEL_STATES = ['not-configured', 'stopped', 'connecting', 'ready', 'degraded', 'failed'] as const;
export type HubTunnelState = (typeof HUB_TUNNEL_STATES)[number];

export const HUB_TUNNEL_LOG_LINES_MAX = 20;
export const HUB_TUNNEL_LOG_LINE_MAX = 300;

export const HubTunnelLogLine = Type.Object({
  at: Type.String({ minLength: 1, maxLength: 40 }),
  stream: Type.Union([Type.Literal('stdout'), Type.Literal('stderr'), Type.Literal('supervisor')]),
  text: Type.String({ maxLength: HUB_TUNNEL_LOG_LINE_MAX }),
});
export type HubTunnelLogLine = Static<typeof HubTunnelLogLine>;

/** The values the owner enters in the Cloudflare dashboard (the tunnel is remotely managed, so the Hub cannot set them). */
export const HubTunnelDashboard = Type.Object({
  hostname: Type.String({ minLength: 1, maxLength: 253 }),
  /** Service type and URL of the public hostname's origin: `https://127.0.0.1:<hub port>`. */
  service: Type.String({ minLength: 1, maxLength: 80 }),
  /** The hop never leaves this machine and the Hub's certificate is private, so the origin is configured with "No TLS Verify". */
  noTlsVerify: Type.Boolean(),
  /** Leave "HTTP Host Header" unset: the Hub needs the original public host name. */
  httpHostHeader: Type.Null(),
});
export type HubTunnelDashboard = Static<typeof HubTunnelDashboard>;

/**
 * The single source of the Cloudflare dashboard guidance (Milestone 840). The Hub status route, the `dude-hub network tunnel on` preview, the
 * desktop provisioning wizard and the Hub-web status all show these values; none of them may restate them. The strings are plain text.
 */
export const HUB_TUNNEL_DASHBOARD_LOCATION = 'Zero Trust > Networks > Tunnels > your tunnel > Public Hostname';
/** Service type of the public hostname's origin. The origin is the Hub's own loopback HTTPS listener. */
export const HUB_TUNNEL_DASHBOARD_SERVICE_TYPE = 'HTTPS';
export const HUB_TUNNEL_NO_TLS_VERIFY_NOTE = "this hop never leaves the machine and the Hub's certificate is private";
export const HUB_TUNNEL_HOST_HEADER_NOTE = 'leave empty (the Hub needs the public host name)';

/** The values for a tunnel host name and the Hub's listening port: `https://127.0.0.1:<port>`, "No TLS Verify" on, no Host header override. */
export function hubTunnelDashboard(hostname: string, port: number): HubTunnelDashboard {
  return { hostname, service: `https://127.0.0.1:${String(port)}`, noTlsVerify: true, httpHostHeader: null };
}

/** The dashboard settings as owner-readable lines, in the order the dashboard asks for them (Public hostname, service, TLS, Host header). */
export function hubTunnelDashboardLines(dashboard: HubTunnelDashboard): readonly string[] {
  return [
    `Public hostname: ${dashboard.hostname} (your domain exactly, no path)`,
    `Service: ${HUB_TUNNEL_DASHBOARD_SERVICE_TYPE}, ${dashboard.service}`,
    dashboard.noTlsVerify ? `TLS: No TLS Verify = on (${HUB_TUNNEL_NO_TLS_VERIFY_NOTE})` : 'TLS: No TLS Verify = off',
    `HTTP Host Header: ${dashboard.httpHostHeader === null ? HUB_TUNNEL_HOST_HEADER_NOTE : dashboard.httpHostHeader}`,
  ];
}

export const HubTunnelStatusResponse = Type.Object({
  /** `exposure.tunnel` exists in `hub.json`. */
  configured: Type.Boolean(),
  enabled: Type.Boolean(),
  hostname: Type.Union([Type.String({ minLength: 1, maxLength: 253 }), Type.Null()]),
  /** The Hub is on Windows, where the tunnel runs (PD-141). */
  supported: Type.Boolean(),
  state: Type.Unsafe<HubTunnelState>({ type: 'string', enum: [...HUB_TUNNEL_STATES] }),
  ready: Type.Boolean(),
  /** Presence only; the token is never returned. */
  tokenPresent: Type.Boolean(),
  restarts: Type.Integer({ minimum: 0 }),
  /** A short code (`token-missing`, `binary-hash-mismatch`, `crashed-repeatedly`, ...), never a message with a value. */
  lastError: Type.Union([Type.String({ maxLength: 64 }), Type.Null()]),
  startedAt: Type.Union([Type.String({ minLength: 1, maxLength: 40 }), Type.Null()]),
  lastReadyAt: Type.Union([Type.String({ minLength: 1, maxLength: 40 }), Type.Null()]),
  dashboard: Type.Union([HubTunnelDashboard, Type.Null()]),
  disclosure: Type.Array(Type.String({ minLength: 1, maxLength: 600 }), { maxItems: 4 }),
  logTail: Type.Array(HubTunnelLogLine, { maxItems: HUB_TUNNEL_LOG_LINES_MAX }),
});
export type HubTunnelStatusResponse = Static<typeof HubTunnelStatusResponse>;
