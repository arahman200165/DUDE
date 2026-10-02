import { readFileSync, renameSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { DeviceCapabilities } from '@dude/persistence';
import type { AppInfo } from './store/identity.js';

/** The last desktop-supplied configuration, kept so the agent can open the store with no desktop connected. */
export const AGENT_CONFIG_FILE = 'agent-config.json';

export interface StoredAgentConfig { appInfo: AppInfo; capabilities: DeviceCapabilities }

const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 256;

/** Accepts only a well-formed config (what the desktop sends); anything else is `null`. */
export function parseAgentConfig(raw: unknown): StoredAgentConfig | null {
  if (!isObject(raw)) return null;
  const info = raw['appInfo'];
  const capabilities = raw['capabilities'];
  if (!isObject(info) || !isObject(capabilities)) return null;
  if (!text(info['appVersion']) || !text(info['platform']) || !text(info['os']) || !text(info['arch'])) return null;
  const entries = Object.entries(capabilities);
  if (entries.length > 64 || entries.some(([key, value]) => typeof value !== 'boolean' || key.length > 64)) return null;
  return {
    appInfo: { appVersion: info['appVersion'], platform: info['platform'] as AppInfo['platform'], os: info['os'], arch: info['arch'] },
    capabilities: Object.fromEntries(entries) as DeviceCapabilities,
  };
}

export function readAgentConfig(storeDir: string): StoredAgentConfig | null {
  try { return parseAgentConfig(JSON.parse(readFileSync(path.join(storeDir, AGENT_CONFIG_FILE), 'utf8'))); } catch { return null; }
}

const canonical = (config: StoredAgentConfig): string => JSON.stringify({
  appInfo: { appVersion: config.appInfo.appVersion, platform: config.appInfo.platform, os: config.appInfo.os, arch: config.appInfo.arch },
  capabilities: Object.fromEntries(Object.entries(config.capabilities).sort(([a], [b]) => (a < b ? -1 : 1))),
});

/** Writes the config when it differs from the stored one (atomic replace); returns whether it wrote. Never throws. */
export function saveAgentConfig(storeDir: string, config: StoredAgentConfig, current: StoredAgentConfig | null): boolean {
  const body = canonical(config);
  if (current && canonical(current) === body) return false;
  const file = path.join(storeDir, AGENT_CONFIG_FILE);
  const temp = `${file}.${process.pid}.tmp`;
  try {
    writeFileSync(temp, body);
    renameSync(temp, file);
    return true;
  } catch {
    return false;
  }
}
