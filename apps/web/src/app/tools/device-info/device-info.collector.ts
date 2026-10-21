import {
  formatBytes,
  userAgentSummaryFacts,
  type DeviceFact,
  type DeviceFactGroup,
} from '@dude/tool-engine/tools/device-info/device-report';
import type { DeviceOsFacts } from '@dude/contracts/shared/models/platform-bridge.model';

/** Browser-only extensions the DOM lib does not type. */
interface NavigatorExtras {
  readonly userAgentData?: { readonly platform?: string; readonly mobile?: boolean; readonly brands?: readonly { readonly brand: string; readonly version: string }[] };
  readonly deviceMemory?: number;
  readonly connection?: { readonly effectiveType?: string; readonly downlink?: number; readonly rtt?: number; readonly saveData?: boolean };
}

const SAMPLE_DATE = new Date(Date.UTC(2026, 0, 31, 13, 45, 0));
const SAMPLE_NUMBER = 1234567.891;

function make(group: DeviceFactGroup, key: string, label: string, value: string | number | boolean | undefined | null): DeviceFact {
  return { id: `${group}.${key}`, group, label, value: value === undefined || value === null ? '' : String(value) };
}

function yesNo(value: boolean | undefined): string {
  return value === undefined ? '' : value ? 'Yes' : 'No';
}

function safe<T>(read: () => T): T | undefined {
  try {
    return read();
  } catch {
    return undefined;
  }
}

/**
 * Reads facts the browser exposes about itself. Read-only: no network, no permission prompts (only
 * APIs that answer without one), nothing stored. Missing APIs simply yield no fact.
 */
export async function collectBrowserFacts(win: Window = window): Promise<DeviceFact[]> {
  const nav = win.navigator as Navigator & NavigatorExtras;
  const query = (media: string): boolean => safe(() => win.matchMedia(media).matches) ?? false;
  const facts: DeviceFact[] = [];

  // Runtime
  facts.push(make('runtime', 'user-agent', 'User agent', nav.userAgent));
  facts.push(...userAgentSummaryFacts(nav.userAgent ?? ''));
  facts.push(make('runtime', 'platform', 'Platform', nav.userAgentData?.platform || nav.platform));
  const brands = nav.userAgentData?.brands?.map((entry) => `${entry.brand} ${entry.version}`).join(', ');
  facts.push(make('runtime', 'brands', 'Browser brands', brands));
  facts.push(make('runtime', 'mobile', 'Mobile browser', yesNo(nav.userAgentData?.mobile)));
  facts.push(make('runtime', 'cookies', 'Cookies enabled', yesNo(nav.cookieEnabled)));
  facts.push(make('runtime', 'secure-context', 'Secure context', yesNo(win.isSecureContext)));
  const displayMode = ['standalone', 'minimal-ui', 'fullscreen', 'window-controls-overlay'].find((mode) => query(`(display-mode: ${mode})`)) ?? 'browser';
  facts.push(make('runtime', 'display-mode', 'Display mode', displayMode));

  // Display
  const { screen } = win;
  facts.push(make('display', 'screen', 'Screen size', screen ? `${screen.width} x ${screen.height}` : ''));
  facts.push(make('display', 'available', 'Available screen size', screen ? `${screen.availWidth} x ${screen.availHeight}` : ''));
  facts.push(make('display', 'viewport', 'Viewport size', `${win.innerWidth} x ${win.innerHeight}`));
  facts.push(make('display', 'dpr', 'Device pixel ratio', win.devicePixelRatio));
  facts.push(make('display', 'color-depth', 'Color depth', screen ? `${screen.colorDepth}-bit` : ''));
  facts.push(make('display', 'orientation', 'Orientation', screen?.orientation?.type));
  facts.push(make('display', 'color-scheme', 'Preferred color scheme', query('(prefers-color-scheme: dark)') ? 'dark' : query('(prefers-color-scheme: light)') ? 'light' : 'no preference'));
  const contrast = query('(prefers-contrast: more)') ? 'more' : query('(prefers-contrast: less)') ? 'less' : query('(prefers-contrast: custom)') ? 'custom' : 'no preference';
  facts.push(make('display', 'contrast', 'Preferred contrast', contrast));
  facts.push(make('display', 'reduced-motion', 'Reduced motion', query('(prefers-reduced-motion: reduce)') ? 'reduce' : 'no preference'));
  facts.push(make('display', 'forced-colors', 'Forced colors', query('(forced-colors: active)') ? 'active' : 'none'));
  facts.push(make('display', 'pointer', 'Primary pointer', query('(pointer: coarse)') ? 'coarse (touch)' : query('(pointer: fine)') ? 'fine (mouse or pen)' : ''));

  // Locale
  const resolved = safe(() => Intl.DateTimeFormat().resolvedOptions());
  facts.push(make('locale', 'language', 'Language', nav.language));
  facts.push(make('locale', 'languages', 'Languages', nav.languages?.join(', ')));
  facts.push(make('locale', 'time-zone', 'Time zone', resolved?.timeZone));
  const offset = -SAMPLE_DATE.getTimezoneOffset();
  const sign = offset < 0 ? '-' : '+';
  const abs = Math.abs(offset);
  facts.push(make('locale', 'utc-offset', 'UTC offset (sample date)', `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`));
  facts.push(make('locale', 'intl-locale', 'Intl locale', resolved?.locale));
  facts.push(make('locale', 'calendar', 'Calendar', resolved?.calendar));
  facts.push(make('locale', 'numbering', 'Numbering system', resolved?.numberingSystem));
  facts.push(make('locale', 'number-sample', 'Number sample', safe(() => new Intl.NumberFormat().format(SAMPLE_NUMBER))));
  facts.push(make('locale', 'date-sample', 'Date sample', safe(() => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(SAMPLE_DATE))));

  // Hardware
  facts.push(make('hardware', 'cpu-count', 'CPU cores', nav.hardwareConcurrency));
  facts.push(make('hardware', 'device-memory', 'Device memory (approx.)', nav.deviceMemory === undefined ? '' : `${nav.deviceMemory} GiB`));
  facts.push(make('hardware', 'touch-points', 'Max touch points', nav.maxTouchPoints));

  // Network and storage
  facts.push(make('network', 'online', 'Online', yesNo(nav.onLine)));
  facts.push(make('network', 'connection-type', 'Connection type', nav.connection?.effectiveType));
  facts.push(make('network', 'downlink', 'Downlink estimate', nav.connection?.downlink === undefined ? '' : `${nav.connection.downlink} Mbit/s`));
  facts.push(make('network', 'rtt', 'Round-trip estimate', nav.connection?.rtt === undefined ? '' : `${nav.connection.rtt} ms`));
  facts.push(make('network', 'save-data', 'Data saver', yesNo(nav.connection?.saveData)));
  const estimate = await safeAsync(() => nav.storage?.estimate());
  if (estimate) {
    facts.push(make('network', 'storage-usage', 'Storage used by this app', estimate.usage === undefined ? '' : formatBytes(estimate.usage)));
    facts.push(make('network', 'storage-quota', 'Storage quota', estimate.quota === undefined ? '' : formatBytes(estimate.quota)));
  }
  return facts;
}

async function safeAsync<T>(read: () => Promise<T> | undefined): Promise<T | undefined> {
  try {
    return await read();
  } catch {
    return undefined;
  }
}

/** Maps the desktop bridge's OS facts to report facts. */
export function osFactsToDeviceFacts(os: DeviceOsFacts): DeviceFact[] {
  return [
    make('os', 'name', 'Operating system', os.osName),
    make('os', 'release', 'OS release', os.osRelease),
    make('os', 'platform', 'OS platform', os.platform),
    make('os', 'arch', 'Architecture', os.arch),
    make('hardware', 'cpu-model', 'CPU model', os.cpuModel),
    make('hardware', 'cpu-count', 'CPU cores', os.cpuCount > 0 ? os.cpuCount : ''),
    make('hardware', 'total-memory', 'Total memory', formatBytes(os.totalMemoryBytes)),
  ];
}
