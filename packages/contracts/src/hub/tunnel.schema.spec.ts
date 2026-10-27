import { describe, expect, it } from 'vitest';
import { Value } from 'typebox/value';
import { HUB_AUDIT_EVENTS } from './audit.js';
import {
  HUB_TUNNEL_DASHBOARD_LOCATION, HUB_TUNNEL_DISCLOSURE, HUB_TUNNEL_PATH, HUB_TUNNEL_PHRASE, HUB_TUNNEL_STATES, HubTunnelDashboard, HubTunnelStatusResponse, hubTunnelDashboard,
  hubTunnelDashboardLines,
} from './tunnel.schema.js';

describe('HubTunnelStatusResponse', () => {
  const idle = {
    configured: false, enabled: false, hostname: null, supported: true, state: 'not-configured', ready: false, tokenPresent: false,
    restarts: 0, lastError: null, startedAt: null, lastReadyAt: null, dashboard: null, disclosure: [...HUB_TUNNEL_DISCLOSURE], logTail: [],
  };

  it('names the path, the phrase and the closed states', () => {
    expect(HUB_TUNNEL_PATH).toBe('/api/v1/tunnel');
    expect(HUB_TUNNEL_PHRASE).toBe('EXPOSE HUB THROUGH CLOUDFLARE');
    expect([...HUB_TUNNEL_STATES]).toEqual(['not-configured', 'stopped', 'connecting', 'ready', 'degraded', 'failed']);
  });

  it('accepts an unconfigured and a ready tunnel', () => {
    expect(Value.Check(HubTunnelStatusResponse, idle)).toBe(true);
    expect(Value.Check(HubTunnelStatusResponse, {
      ...idle, configured: true, enabled: true, hostname: 'notes.example.com', state: 'ready', ready: true, tokenPresent: true, startedAt: '2026-10-27T10:00:00.000Z',
      lastReadyAt: '2026-10-27T10:00:05.000Z', dashboard: { hostname: 'notes.example.com', service: 'https://127.0.0.1:47600', noTlsVerify: true, httpHostHeader: null },
      logTail: [{ at: '2026-10-27T10:00:05.000Z', stream: 'stderr', text: 'Registered tunnel connection' }],
    })).toBe(true);
  });

  it('rejects an unknown state or too long a log tail, and the disclosure states the edge-TLS and upload facts', () => {
    expect(Value.Check(HubTunnelStatusResponse, { ...idle, state: 'on' })).toBe(false);
    expect(Value.Check(HubTunnelStatusResponse, { ...idle, logTail: Array.from({ length: 21 }, () => ({ at: 'x', stream: 'stdout', text: 't' })) })).toBe(false);
    expect(HUB_TUNNEL_DISCLOSURE.join(' ')).toMatch(/Cloudflare terminates TLS/);
    expect(HUB_TUNNEL_DISCLOSURE.join(' ')).toMatch(/8 MiB/);
  });

  it('adds the tunnel audit events to the closed list', () => {
    for (const event of ['tunnel.enabled', 'tunnel.disabled', 'tunnel.token-set', 'tunnel.degraded']) expect(HUB_AUDIT_EVENTS as readonly string[]).toContain(event);
  });
});

describe('Cloudflare dashboard guidance', () => {
  it('derives the origin values from the host name and the Hub port only', () => {
    const dashboard = hubTunnelDashboard('notes.example.com', 47600);
    expect(dashboard).toEqual({ hostname: 'notes.example.com', service: 'https://127.0.0.1:47600', noTlsVerify: true, httpHostHeader: null });
    expect(Value.Check(HubTunnelDashboard, dashboard)).toBe(true);
  });

  it('lists the hostname, HTTPS service, No TLS Verify on and no Host header override', () => {
    expect(hubTunnelDashboardLines(hubTunnelDashboard('notes.example.com', 47600))).toEqual([
      'Public hostname: notes.example.com (your domain exactly, no path)',
      'Service: HTTPS, https://127.0.0.1:47600',
      "TLS: No TLS Verify = on (this hop never leaves the machine and the Hub's certificate is private)",
      'HTTP Host Header: leave empty (the Hub needs the public host name)',
    ]);
    expect(HUB_TUNNEL_DASHBOARD_LOCATION).toContain('Public Hostname');
  });
});
