import { describe, expect, it } from 'vitest';
import {
  HIBERNATEIDLE_GUID, POWER_MINUTES_MAX, STANDBYIDLE_GUID, changeCommand, createPowercfgRunner, minutesOf, parseAcSeconds, parseSleepStates, readPowerPolicy,
} from './powercfg.js';
import type { PowerRunner } from './powercfg.js';
import { AVAILABLE_EN, AVAILABLE_MODERN, QUERY_DE, QUERY_EN } from './power-fixture.js';

type Answers = Record<string, { code: number; stdout: string } | Error>;
/** A fake runner keyed by the joined argument vector; an unknown command is a test failure. */
function fake(answers: Answers): { runner: PowerRunner; calls: string[][] } {
  const calls: string[][] = [];
  const runner: PowerRunner = (args) => {
    calls.push([...args]);
    const answer = answers[args.join(' ')];
    if (answer === undefined) return Promise.reject(new Error(`unexpected powercfg ${args.join(' ')}`));
    if (answer instanceof Error) return Promise.reject(answer);
    return Promise.resolve({ stdout: answer.stdout, stderr: '', code: answer.code });
  };
  return { runner, calls };
}
const SLEEP = '/query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE';
const HIBERNATE = '/query SCHEME_CURRENT SUB_SLEEP HIBERNATEIDLE';

describe('powercfg parsing (by GUID and by the shape of the index lines, never by label)', () => {
  it('reads the AC timeout of an English and a German /query', () => {
    expect(parseAcSeconds(QUERY_EN(STANDBYIDLE_GUID, 'Sleep after', '00000708', '00000384'), STANDBYIDLE_GUID)).toBe(1800);
    expect(parseAcSeconds(QUERY_DE(STANDBYIDLE_GUID, 'Energie sparen nach', '00000000', '00000708'), STANDBYIDLE_GUID)).toBe(0);
    expect(parseAcSeconds(QUERY_EN(HIBERNATEIDLE_GUID, 'Hibernate after', '00002a30', '00002a30'), HIBERNATEIDLE_GUID)).toBe(10800);
    // CRLF line endings, as powercfg writes them
    expect(parseAcSeconds(QUERY_EN(STANDBYIDLE_GUID, 'Sleep after', '0000003c', '00000000').replace(/\n/g, '\r\n'), STANDBYIDLE_GUID)).toBe(60);
  });

  it('refuses output that is not the setting asked for, has no index lines, or ends mid-way', () => {
    expect(parseAcSeconds(QUERY_EN(HIBERNATEIDLE_GUID, 'Hibernate after', '00000000', '00000000'), STANDBYIDLE_GUID)).toBeNull();
    expect(parseAcSeconds('', STANDBYIDLE_GUID)).toBeNull();
    expect(parseAcSeconds(`${STANDBYIDLE_GUID}\nnothing useful here\nat all`, STANDBYIDLE_GUID)).toBeNull();
    // only the AC line present: the last two lines must both be index lines, so a single one is never guessed
    expect(parseAcSeconds(`Power Setting GUID: ${STANDBYIDLE_GUID}  (x)\n    Possible Settings units: Seconds\n    Current AC Power Setting Index: 0x00000000\n`, STANDBYIDLE_GUID)).toBeNull();
    expect(parseAcSeconds(`${STANDBYIDLE_GUID}\n    Current AC Power Setting Index: 0xZZ\n    Current DC Power Setting Index: 0x00000000\n`, STANDBYIDLE_GUID)).toBeNull();
  });

  it('turns seconds into the minutes Power Options shows; a partial minute is never read as never', () => {
    expect(minutesOf(0)).toBe(0);
    expect(minutesOf(1)).toBe(1);
    expect(minutesOf(60)).toBe(1);
    expect(minutesOf(61)).toBe(2);
    expect(minutesOf(1800)).toBe(30);
  });

  it('lists the available sleep states from the first block of /a only, by their (S?) tokens', () => {
    expect(parseSleepStates(AVAILABLE_EN)).toEqual(['S3']);
    expect(parseSleepStates(AVAILABLE_MODERN)).toEqual(['S0ix']);
    expect(parseSleepStates('')).toEqual([]);
  });

  it('builds a fixed argument vector for a change and refuses a value that is not whole minutes in range', () => {
    expect(changeCommand('standby', 0)).toEqual({ setting: 'standby', minutes: 0, args: ['/change', 'standby-timeout-ac', '0'], display: 'powercfg /change standby-timeout-ac 0' });
    expect(changeCommand('hibernate', 45).args).toEqual(['/change', 'hibernate-timeout-ac', '45']);
    for (const bad of [-1, 1.5, Number.NaN, POWER_MINUTES_MAX + 1]) expect(() => changeCommand('standby', bad)).toThrow(RangeError);
  });
});

describe('readPowerPolicy', () => {
  const answers = (sleep: string, hibernate: string | null): Answers => ({
    [SLEEP]: { code: 0, stdout: QUERY_EN(STANDBYIDLE_GUID, 'Sleep after', sleep, '00000384') },
    [HIBERNATE]: hibernate === null ? { code: 1, stdout: '' } : { code: 0, stdout: QUERY_EN(HIBERNATEIDLE_GUID, 'Hibernate after', hibernate, '00002a30') },
    '/a': { code: 0, stdout: AVAILABLE_EN },
  });

  it('is ok when neither AC timeout is set, and asks powercfg only with fixed argument vectors', async () => {
    const { runner, calls } = fake(answers('00000000', '00000000'));
    expect(await readPowerPolicy(runner, 'win32')).toEqual({ verdict: 'ok', sleepAcMinutes: 0, hibernateAcMinutes: 0, sleepStates: ['S3'] });
    expect(calls).toEqual([['/query', 'SCHEME_CURRENT', 'SUB_SLEEP', 'STANDBYIDLE'], ['/query', 'SCHEME_CURRENT', 'SUB_SLEEP', 'HIBERNATEIDLE'], ['/a']]);
  });

  it('needs a change when the sleep timeout or the hibernate timeout is set', async () => {
    expect(await readPowerPolicy(fake(answers('00000708', '00000000')).runner, 'win32')).toMatchObject({ verdict: 'needs-change', sleepAcMinutes: 30, hibernateAcMinutes: 0 });
    expect(await readPowerPolicy(fake(answers('00000000', '00002a30')).runner, 'win32')).toMatchObject({ verdict: 'needs-change', sleepAcMinutes: 0, hibernateAcMinutes: 180 });
  });

  it('treats a plan without a hibernate setting as ok when sleep is never', async () => {
    expect(await readPowerPolicy(fake(answers('00000000', null)).runner, 'win32')).toMatchObject({ verdict: 'ok', sleepAcMinutes: 0, hibernateAcMinutes: null });
  });

  it('reads a localized Windows the same way', async () => {
    const de: Answers = {
      [SLEEP]: { code: 0, stdout: QUERY_DE(STANDBYIDLE_GUID, 'Energie sparen nach', '00000258', '00000384') },
      [HIBERNATE]: { code: 0, stdout: QUERY_DE(HIBERNATEIDLE_GUID, 'Ruhezustand nach', '00000000', '00002a30') },
      '/a': { code: 0, stdout: AVAILABLE_EN },
    };
    expect(await readPowerPolicy(fake(de).runner, 'win32')).toMatchObject({ verdict: 'needs-change', sleepAcMinutes: 10, hibernateAcMinutes: 0 });
  });

  it('is unsupported off Windows without running anything, and when powercfg is missing', async () => {
    const none = fake({});
    expect(await readPowerPolicy(none.runner, 'linux')).toMatchObject({ verdict: 'unsupported', sleepAcMinutes: null });
    expect(none.calls).toEqual([]);
    const missing = Object.assign(new Error('spawn powercfg ENOENT'), { code: 'ENOENT' });
    expect(await readPowerPolicy(fake({ [SLEEP]: missing }).runner, 'win32')).toMatchObject({ verdict: 'unsupported' });
  });

  it('is unknown, never a guess, when the sleep setting cannot be read or the output is not understood', async () => {
    expect(await readPowerPolicy(fake({ [SLEEP]: { code: 1, stdout: '' }, [HIBERNATE]: { code: 1, stdout: '' }, '/a': { code: 1, stdout: '' } }).runner, 'win32')).toMatchObject({ verdict: 'unknown', sleepAcMinutes: null });
    expect(await readPowerPolicy(fake({ [SLEEP]: { code: 0, stdout: 'garbage' }, [HIBERNATE]: { code: 1, stdout: '' }, '/a': { code: 1, stdout: '' } }).runner, 'win32')).toMatchObject({ verdict: 'unknown' });
    // the sleep setting is fine but the hibernate setting exists and is unreadable
    expect(await readPowerPolicy(fake({ ...answers('00000000', null), [HIBERNATE]: { code: 0, stdout: 'garbage' } }).runner, 'win32')).toMatchObject({ verdict: 'unknown', sleepAcMinutes: 0 });
    // a timeout or any other failure to start powercfg
    expect(await readPowerPolicy(fake({ [SLEEP]: new Error('timed out') }).runner, 'win32')).toMatchObject({ verdict: 'unknown' });
  });

  it('keeps going when /a fails: the sleep states are informational', async () => {
    const a = answers('00000000', '00000000');
    a['/a'] = new Error('boom');
    expect(await readPowerPolicy(fake(a).runner, 'win32')).toMatchObject({ verdict: 'ok', sleepStates: [] });
  });

  it('the real runner resolves a fixed System32 path (no shell, no PATH lookup)', async () => {
    const runner = createPowercfgRunner({ SystemRoot: 'C:\\Nope' });
    // The binary does not exist here, so the runner rejects with ENOENT instead of resolving; a shell would have answered.
    await expect(runner(['/a'])).rejects.toBeDefined();
  });
});
