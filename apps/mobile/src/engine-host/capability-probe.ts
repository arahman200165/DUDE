import { hostCrypto } from '@dude/crypto/host';

export interface ProbeEntry { readonly name: string; readonly ok: boolean; readonly detail?: string }
type Env = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
const toHex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map(byte => byte.toString(16).padStart(2, '0')).join('');

async function check(name: string, run: () => unknown | Promise<unknown>): Promise<ProbeEntry> {
  try {
    const result = await run();
    return result === true || result === undefined ? { name, ok: true } : { name, ok: false, detail: String(result) };
  } catch (error) {
    return { name, ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

/** Reports which Hermes/host facilities the shared engines can rely on. Pure: reads only `env` and the installed engine host. */
export async function runCapabilityProbe(env: Env = globalThis as Env): Promise<readonly ProbeEntry[]> {
  return Promise.all([
    check('textencoder', () => new env['TextEncoder']().encode('é€').length === 5),
    check('textdecoder', () => new env['TextDecoder']().decode(new Uint8Array([0xc3, 0xa9])) === 'é'),
    check('textdecoder-fatal', () => {
      const decoder = new env['TextDecoder']('utf-8', { fatal: true });
      try { decoder.decode(new Uint8Array([0xff])); } catch { return true; }
      return 'fatal decoder accepted invalid UTF-8';
    }),
    check('url', () => new env['URL']('https://user@example.com:8443/a/b?x=1#h').port === '8443'),
    check('urlsearchparams', () => new env['URLSearchParams']('a=1&b=2').get('b') === '2'),
    check('getrandomvalues', () => env['crypto'].getRandomValues(new Uint8Array(8)).length === 8),
    check('randomuuid', () => /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(env['crypto'].randomUUID())),
    check('subtle-digest', async () => toHex(await hostCrypto().subtle.digest('SHA-256', new TextEncoder().encode('abc'))) === SHA256_ABC),
    check('intl-timezone', () => new env['Intl'].DateTimeFormat('en-US', { timeZone: 'America/New_York', timeZoneName: 'short', hour: 'numeric' }).format(new Date(Date.UTC(2024, 0, 15, 12))).length > 0),
    check('intl-segmenter', () => [...new env['Intl'].Segmenter('en', { granularity: 'grapheme' }).segment('éa')].length === 2),
    check('intl-supportedvaluesof', () => env['Intl'].supportedValuesOf('timeZone').length > 0),
    check('intl-relativetimeformat', () => new env['Intl'].RelativeTimeFormat('en').format(-1, 'day').length > 0),
    check('normalize', () => 'é'.normalize('NFC') === 'é'),
    check('atob-btoa', () => env['btoa']('abc') === 'YWJj' && env['atob']('YWJj') === 'abc'),
    check('structuredclone', () => env['structuredClone']({ a: [1] }).a[0] === 1),
    check('webassembly', () => typeof env['WebAssembly']?.instantiate === 'function'),
    check('bigint', () => env['BigInt'](2) ** 64n === 18446744073709551616n),
  ]);
}
