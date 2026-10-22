import { AccessibilityInfo, Appearance, Dimensions, PixelRatio, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Network from 'expo-network';
import { buildDeviceReport, formatBytes, type DeviceFact, type DeviceFactGroup, type DeviceReport } from '@dude/tool-engine/tools/device-info/device-report';

// Privacy: no device name, serial/Android ID, IP/MAC or SSID is read. Network facts are type and reachability only.
const SAMPLE_DATE = new Date(Date.UTC(2026, 0, 31, 13, 45, 0));
const SAMPLE_NUMBER = 1234567.891;

function make(group: DeviceFactGroup, key: string, label: string, value: string | number | boolean | null | undefined): DeviceFact {
  return { id: `${group}.${key}`, group, label, value: value === undefined || value === null ? '' : String(value) };
}
const yesNo = (value: boolean | undefined | null): string => value === undefined || value === null ? '' : value ? 'Yes' : 'No';
function safe<T>(read: () => T): T | undefined { try { return read(); } catch { return undefined; } }
async function safeAsync<T>(read: () => Promise<T>): Promise<T | undefined> { try { return await read(); } catch { return undefined; } }

const DEVICE_TYPES: Readonly<Record<number, string>> = { 0: 'Unknown', 1: 'Phone', 2: 'Tablet', 3: 'Desktop', 4: 'TV' };

function utcOffset(): string {
  const offset = -SAMPLE_DATE.getTimezoneOffset();
  const abs = Math.abs(offset);
  return `${offset < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

/** Collects Android facts from React Native, expo-device, expo-network and expo-constants. Read-only; no permission prompts. */
export async function collectAndroidReport(now: Date = new Date()): Promise<DeviceReport> {
  const [reduceMotion, highContrast, network] = await Promise.all([
    safeAsync(() => AccessibilityInfo.isReduceMotionEnabled()),
    safeAsync(() => AccessibilityInfo.isHighTextContrastEnabled()),
    safeAsync(() => Network.getNetworkStateAsync()),
  ]);
  const ratio = PixelRatio.get();
  const screen = Dimensions.get('screen');
  const resolved = safe(() => Intl.DateTimeFormat().resolvedOptions());
  const apiLevel = Device.platformApiLevel ?? (typeof Platform.Version === 'number' ? Platform.Version : null);
  const osVersion = Device.osVersion ?? '';
  const px = (dp: number): number => Math.round(dp * ratio);
  const facts: DeviceFact[] = [
    make('os', 'os-version', 'Android version', osVersion ? `Android ${osVersion}` : apiLevel === null ? '' : `Android (API ${apiLevel})`),
    make('os', 'api-level', 'API level', apiLevel),

    make('hardware', 'manufacturer', 'Manufacturer', Device.manufacturer),
    make('hardware', 'brand', 'Brand', Device.brand),
    make('hardware', 'model', 'Model', Device.modelName),
    make('hardware', 'device-type', 'Device type', Device.deviceType === null ? '' : DEVICE_TYPES[Device.deviceType]),
    make('hardware', 'total-memory', 'Total memory', Device.totalMemory === null ? '' : formatBytes(Device.totalMemory)),
    make('hardware', 'cpu-abis', 'Supported CPU ABIs', Device.supportedCpuArchitectures?.join(', ')),
    make('hardware', 'form', 'Emulator or physical', Device.isDevice ? 'Physical device' : 'Emulator'),

    make('runtime', 'hermes', 'Hermes engine', yesNo(!!(globalThis as { HermesInternal?: unknown }).HermesInternal)),
    make('runtime', 'app-version', 'App version', Constants.expoConfig?.version),
    make('runtime', 'app-build', 'App build', Constants.expoConfig?.android?.versionCode),

    make('display', 'screen-dp', 'Screen size (dp)', `${Math.round(screen.width)} x ${Math.round(screen.height)}`),
    make('display', 'screen-px', 'Screen size (px)', `${px(screen.width)} x ${px(screen.height)}`),
    make('display', 'pixel-ratio', 'Pixel ratio', ratio),
    make('display', 'font-scale', 'Font scale', PixelRatio.getFontScale()),
    make('display', 'color-scheme', 'Color scheme', Appearance.getColorScheme() ?? 'no preference'),
    make('display', 'high-contrast', 'High contrast text', yesNo(highContrast)),
    make('display', 'reduce-motion', 'Reduce motion', yesNo(reduceMotion)),

    make('locale', 'locale', 'Locale', resolved?.locale),
    make('locale', 'time-zone', 'Time zone', resolved?.timeZone),
    make('locale', 'utc-offset', 'UTC offset (sample date)', utcOffset()),
    make('locale', 'number-sample', 'Number sample', safe(() => new Intl.NumberFormat().format(SAMPLE_NUMBER))),
    make('locale', 'date-sample', 'Date sample', safe(() => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(SAMPLE_DATE))),

    make('network', 'network-type', 'Network type', network?.type),
    make('network', 'connected', 'Connected', yesNo(network?.isConnected)),
    make('network', 'internet', 'Internet reachable', yesNo(network?.isInternetReachable)),
  ];
  return buildDeviceReport('android', facts, now);
}
