import { runFixedScript } from './sys-pwsh';
import { sysHelper } from './sys-helper';
import type { InstalledSoftware, SoftwareRegistryRecord, SoftwareSource } from "@dude/contracts/system/software-types";

const UNINSTALL_KEYS = 'Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall';
const CONTROL = /[\u0000-\u001f\u007f]/;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() && !CONTROL.test(value) ? value.trim() : null;
}

function valuesRecord(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) {
    const result: Record<string, unknown> = {};
    for (const entry of value) {
      if (!entry || typeof entry !== 'object') continue;
      const item = entry as { name?: unknown; data?: unknown };
      if (typeof item.name === 'string') result[item.name.toLowerCase()] = item.data;
    }
    return result;
  }
  if (!value || typeof value !== 'object') return {};
  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) result[key.toLowerCase()] = item;
  return result;
}

function safeVendorCommand(raw: string | null): boolean {
  if (!raw || raw.length > 8192 || CONTROL.test(raw)) return false;
  // This intentionally accepts only a directly launched executable followed by plain arguments.
  // Shells, script hosts, URL handlers, pipes, redirections and command separators are excluded.
  if (/[&|<>^%\n\r]/.test(raw) || /\b(?:cmd(?:\.exe)?|powershell(?:\.exe)?|pwsh(?:\.exe)?|wscript(?:\.exe)?|cscript(?:\.exe)?|mshta(?:\.exe)?|rundll32(?:\.exe)?)\b/i.test(raw)) return false;
  const match = raw.trim().match(/^(?:"([^"\r\n]+\.exe)"|([^\s"']+\.exe))(?:\s+(.*))?$/i);
  if (!match) return false;
  const exe = match[1] ?? match[2] ?? '';
  const args = match[3] ?? '';
  if (!/^(?:[a-z]:\\|\\\\)[^"<>|?*]+\.exe$/i.test(exe) && !/^msiexec(?:\.exe)?$/i.test(exe)) return false;
  return !/["<>|?*]/.test(args) && !args.includes('`');
}

function msiProductCode(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/\{[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\}/i);
  return match?.[0].toUpperCase() ?? null;
}

function normalizeRegistry(record: SoftwareRegistryRecord): InstalledSoftware | null {
  const v = valuesRecord(record.values);
  const name = text(v['displayname']);
  if (!name || v['systemcomponent'] === 1 || v['systemcomponent'] === 0x1) return null;
  const rawUninstall = text(v['uninstallstring']);
  const productCode = msiProductCode(rawUninstall);
  const rawSize = v['estimatedsize'];
  const parsedSize = typeof rawSize === 'number' ? rawSize : typeof rawSize === 'string' && /^\d+$/.test(rawSize) ? Number(rawSize) : NaN;
  const sizeBytes = parsedSize * 1024;
  const estimatedSizeBytes = Number.isSafeInteger(parsedSize) && parsedSize >= 0 && Number.isSafeInteger(sizeBytes) ? sizeBytes : null;
  const installDateRaw = text(v['installdate']);
  const installDate = installDateRaw && /^\d{8}$/.test(installDateRaw) ? installDateRaw : null;
  const source: SoftwareSource = record.hive === 'HKCU' ? 'user' : record.view === '32' ? 'registry-32' : 'registry-64';
  return {
    id: `${record.hive}:${record.view}:${record.keyName}`,
    name, publisher: text(v['publisher']), installDate, estimatedSizeBytes,
    version: text(v['displayversion']), source,
    installLocation: text(v['installlocation']), uninstallCommand: rawUninstall,
    uninstallable: safeVendorCommand(rawUninstall),
    productCode,
  };
}

function asList<T>(value: unknown): T[] { return Array.isArray(value) ? value as T[] : value ? [value as T] : []; }

/** Reads uninstall registry views and per-user Appx packages. Enumeration errors are isolated per source. */
export async function listInstalledSoftware(): Promise<InstalledSoftware[]> {
  const rows: InstalledSoftware[] = [];
  const helper = sysHelper();
  const sources: { hive: 'HKLM' | 'HKCU'; view: '64' | '32' | 'default' }[] = [
    { hive: 'HKLM', view: '64' }, { hive: 'HKLM', view: '32' }, { hive: 'HKCU', view: 'default' },
  ];
  for (const { hive, view } of sources) {
    const keys = await helper.call('reg.enumKey', { hive, path: UNINSTALL_KEYS, view });
    if (!keys.ok) continue;
    const names = (keys.data as { subkeys?: unknown } | null)?.subkeys;
    for (const subkey of asList<unknown>(names)) {
      const keyName = typeof subkey === 'string'
        ? subkey
        : subkey && typeof subkey === 'object' && typeof (subkey as { name?: unknown }).name === 'string'
          ? (subkey as { name: string }).name
          : null;
      if (typeof keyName !== 'string' || !keyName || keyName.includes('\\') || CONTROL.test(keyName)) continue;
      const result = await helper.call('reg.getValues', { hive, path: `${UNINSTALL_KEYS}\\${keyName}`, view });
      if (!result.ok) continue;
      const data = result.data as { values?: unknown } | null;
      const vals = data?.values;
      const row = normalizeRegistry({ hive, view, keyName, values: vals as SoftwareRegistryRecord['values'] });
      if (row) rows.push(row);
    }
  }
  try {
    const appx = await runFixedScript('software.appx', {}, new AbortController().signal);
    for (const item of asList<Record<string, unknown>>(appx)) {
      const name = text(item.name ?? item.Name);
      if (!name) continue;
      rows.push({ id: `appx:${text(item.packageFullName ?? item.PackageFullName) ?? name}`, name,
        publisher: text(item.publisher ?? item.Publisher), installDate: null,
        estimatedSizeBytes: null, version: text(item.version ?? item.Version), source: 'appx',
        installLocation: null, uninstallCommand: null, uninstallable: false, productCode: null });
    }
  } catch { /* Appx is optional when PowerShell 7 or the Appx provider is unavailable. */ }
  return rows;
}

export { safeVendorCommand };
