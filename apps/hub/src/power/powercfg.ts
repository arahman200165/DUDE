import { execFile } from 'node:child_process';
import path from 'node:path';
import type { HubPowerSetting, HubPowerVerdict } from '@dude/contracts/hub';

/**
 * Reading and changing the Windows power plan through `powercfg` (32-SS1, Milestone 851, PD-142). Nothing here touches the shell: the
 * binary is one fixed path, every call is a fixed argument vector built from typed values, and output is parsed by GUIDs and by the
 * shape of the hexadecimal index lines, never by a label (labels are localized; `Sleep after` is `Energie sparen nach` on a German
 * Windows, the GUIDs and the `0x........` values are not).
 */
export interface PowerRunResult { stdout: string; stderr: string; code: number }
/** Runs `powercfg` with exactly these arguments; rejects when it could not be started (missing binary, timeout), resolves with the exit code otherwise. */
export type PowerRunner = (args: readonly string[]) => Promise<PowerRunResult>;

/** Sleep subgroup and the two AC settings of the policy, by GUID. */
export const SUB_SLEEP_GUID = '238c9fa8-0aad-41ed-83f4-97be242c8f20';
export const STANDBYIDLE_GUID = '29f6c1db-86da-48c5-9fdb-f2b67b1f44da';
export const HIBERNATEIDLE_GUID = '9d7815a6-7ee4-497e-8888-515a05f02364';

const QUERY_ARGS: Record<HubPowerSetting, readonly string[]> = {
  standby: ['/query', 'SCHEME_CURRENT', 'SUB_SLEEP', 'STANDBYIDLE'],
  hibernate: ['/query', 'SCHEME_CURRENT', 'SUB_SLEEP', 'HIBERNATEIDLE'],
};
const SETTING_GUID: Record<HubPowerSetting, string> = { standby: STANDBYIDLE_GUID, hibernate: HIBERNATEIDLE_GUID };
/** The `powercfg /change` names (minutes, 0 = never). */
export const POWERCFG_CHANGE_NAME: Record<HubPowerSetting, string> = { standby: 'standby-timeout-ac', hibernate: 'hibernate-timeout-ac' };
/** The most minutes a restore will write back (a week); anything longer is not a value a person chose in Power Options. */
export const POWER_MINUTES_MAX = 7 * 24 * 60;

export interface PowerReading {
  verdict: HubPowerVerdict;
  /** AC "sleep after" in minutes (0 = never); null when it could not be read. */
  sleepAcMinutes: number | null;
  /** AC "hibernate after" in minutes (0 = never); null when the setting is absent on this machine or could not be read. */
  hibernateAcMinutes: number | null;
  sleepStates: string[];
}

export interface PowerCommand {
  setting: HubPowerSetting;
  minutes: number;
  /** The exact argument vector handed to `powercfg`. */
  args: string[];
  /** The same command as the owner would type it (display only; never executed through a shell). */
  display: string;
}

/** `powercfg /change <setting>-timeout-ac <minutes>`; the minutes are validated, so no free text ever reaches an argument. */
export function changeCommand(setting: HubPowerSetting, minutes: number): PowerCommand {
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > POWER_MINUTES_MAX) throw new RangeError('Power timeout minutes out of range.');
  const args = ['/change', POWERCFG_CHANGE_NAME[setting], String(minutes)];
  return { setting, minutes, args, display: `powercfg ${args.join(' ')}` };
}

/** The AC index line is the second to last line of a `/query` of one setting and the DC line the last; both end in `0x` and hexadecimal digits. */
const INDEX_LINE = /^.*?:\s*0x([0-9a-fA-F]{1,8})\s*$/;

/** The AC timeout of one `/query` output in seconds, or null when the output is not the one setting asked for or has no index lines. */
export function parseAcSeconds(stdout: string, settingGuid: string): number | null {
  if (!stdout.toLowerCase().includes(settingGuid)) return null;
  const lines = stdout.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length < 2) return null;
  const ac = INDEX_LINE.exec(lines[lines.length - 2]!);
  const dc = INDEX_LINE.exec(lines[lines.length - 1]!);
  if (ac === null || dc === null) return null;
  return Number.parseInt(ac[1]!, 16);
}

/** Seconds as the minutes Power Options shows (a partial minute counts as a minute, so a nonzero timeout is never read as "never"). */
export const minutesOf = (seconds: number): number => Math.ceil(seconds / 60);

/**
 * The sleep states `powercfg /a` lists as available: its first block (up to the first blank line) names them as `(S3)`, `(S1)`,
 * `(S0 Low Power Idle)`. Informational; the verdict never depends on it.
 */
export function parseSleepStates(stdout: string): string[] {
  const states: string[] = [];
  const first = stdout.split(/\r?\n\s*\r?\n/)[0] ?? '';
  for (const match of first.matchAll(/\(S([0-3])(?:\s[^)]*)?\)/g)) {
    const state = match[1] === '0' ? 'S0ix' : `S${match[1]!}`;
    if (!states.includes(state)) states.push(state);
  }
  return states;
}

type QueryOutcome = { state: 'value'; minutes: number } | { state: 'missing' | 'unreadable' | 'unsupported' };

/** Reads the AC sleep and hibernate timeouts of the active plan. Never throws: a failure is a verdict. */
export async function readPowerPolicy(runner: PowerRunner, platform: NodeJS.Platform): Promise<PowerReading> {
  const unsupported: PowerReading = { verdict: 'unsupported', sleepAcMinutes: null, hibernateAcMinutes: null, sleepStates: [] };
  if (platform !== 'win32') return unsupported;
  const query = async (setting: HubPowerSetting): Promise<QueryOutcome> => {
    let result: PowerRunResult;
    try {
      result = await runner(QUERY_ARGS[setting]);
    } catch (error) {
      return { state: (error as { code?: unknown }).code === 'ENOENT' ? 'unsupported' : 'unreadable' };
    }
    // A hibernate setting that the plan does not have (hibernation off) is absent, not unreadable; a sleep setting always exists.
    if (result.code !== 0) return { state: setting === 'hibernate' ? 'missing' : 'unreadable' };
    const seconds = parseAcSeconds(result.stdout, SETTING_GUID[setting]);
    return seconds === null ? { state: 'unreadable' } : { state: 'value', minutes: minutesOf(seconds) };
  };
  const sleep = await query('standby');
  if (sleep.state === 'unsupported') return unsupported;
  const hibernate = await query('hibernate');
  let sleepStates: string[] = [];
  try {
    const available = await runner(['/a']);
    if (available.code === 0) sleepStates = parseSleepStates(available.stdout);
  } catch { /* informational only */ }
  const sleepMinutes = sleep.state === 'value' ? sleep.minutes : null;
  const hibernateMinutes = hibernate.state === 'value' ? hibernate.minutes : null;
  // An unreadable sleep setting, or a hibernate setting that exists but cannot be read, is never guessed as ok.
  if (sleepMinutes === null || hibernate.state === 'unreadable' || hibernate.state === 'unsupported') {
    return { verdict: 'unknown', sleepAcMinutes: sleepMinutes, hibernateAcMinutes: hibernateMinutes, sleepStates };
  }
  const verdict: HubPowerVerdict = sleepMinutes > 0 || (hibernateMinutes ?? 0) > 0 ? 'needs-change' : 'ok';
  return { verdict, sleepAcMinutes: sleepMinutes, hibernateAcMinutes: hibernateMinutes, sleepStates };
}

/** The real runner: `%SystemRoot%\System32\powercfg.exe`, no shell, hidden window, bounded time and output. */
export function createPowercfgRunner(env: Record<string, string | undefined> = process.env): PowerRunner {
  const exe = path.win32.join(env['SystemRoot'] ?? env['windir'] ?? 'C:\\Windows', 'System32', 'powercfg.exe');
  return (args) =>
    new Promise((resolve, reject) => {
      execFile(exe, [...args], { windowsHide: true, timeout: 15_000, maxBuffer: 1024 * 1024, encoding: 'utf8', shell: false }, (error, stdout, stderr) => {
        if (error !== null && typeof (error as { code?: unknown }).code !== 'number') {
          reject(error);
          return;
        }
        resolve({ stdout, stderr, code: error === null ? 0 : (error as { code: number }).code });
      });
    });
}
