import { UAParser } from 'ua-parser-js';

export interface ParsedUserAgent {
  readonly browser: { readonly name?: string; readonly version?: string };
  readonly engine: { readonly name?: string; readonly version?: string };
  readonly os: { readonly name?: string; readonly version?: string };
  readonly device: { readonly type?: string; readonly vendor?: string; readonly model?: string };
  readonly cpu: { readonly architecture?: string };
}

export type UserAgentParseResult =
  | { readonly ok: true; readonly parsed: ParsedUserAgent }
  | { readonly ok: false; readonly error: string };

/**
 * ua-parser-js essentially never throws — it degrades gracefully on
 * malformed input by returning mostly-undefined fields. The `ok: false`
 * branch here exists almost entirely for the empty-input guard.
 */
export function parseUserAgent(uaString: string): UserAgentParseResult {
  const trimmed = uaString.trim();
  if (trimmed === '') return { ok: false, error: 'Enter a User-Agent string.' };

  const result = UAParser(trimmed);

  return {
    ok: true,
    parsed: {
      browser: { name: result.browser.name, version: result.browser.version },
      engine: { name: result.engine.name, version: result.engine.version },
      os: { name: result.os.name, version: result.os.version },
      device: { type: result.device.type, vendor: result.device.vendor, model: result.device.model },
      cpu: { architecture: result.cpu.architecture },
    },
  };
}
