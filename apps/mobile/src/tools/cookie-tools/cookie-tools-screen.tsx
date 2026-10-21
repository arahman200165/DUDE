import { buildCookieHeader, parseCookieHeader } from '@dude/tool-engine/tools/cookie-tools/cookie-header';
import { buildSetCookieHeader, checkSetCookieWarnings, parseSetCookieHeader } from '@dude/tool-engine/tools/cookie-tools/set-cookie';
import { defineTextTool, type KeyValueRow, type TextToolMode } from '../../kit';

const flag = (value: boolean): string => (value ? 'Yes' : 'No');

/**
 * Web key `mode` (`cookie` | `set-cookie`). Web edits the parsed fields to rebuild the header; here the parsed values are
 * shown as copyable rows plus the normalised rebuilt header (the engine build functions). Raw input is never persisted
 * (cookies carry session tokens), matching web.
 */
const modes: readonly TextToolMode[] = [
  {
    id: 'cookie',
    label: 'Cookie',
    run: input => {
      const pairs = parseCookieHeader(input);
      if (pairs.length === 0) return { ok: false, error: 'No cookies found. Expected name=value pairs separated by semicolons.' };
      const rows: KeyValueRow[] = [
        ...pairs.map((pair, index) => ({ key: `cookie-${index}`, label: pair.key || '(unnamed)', value: pair.value })),
        { key: 'header', label: 'Rebuilt header', value: buildCookieHeader(pairs) },
      ];
      return { ok: true, output: rows };
    },
  },
  {
    id: 'set-cookie',
    label: 'Set-Cookie',
    run: input => {
      const attributes = parseSetCookieHeader(input);
      if (attributes.name === '') return { ok: false, error: 'No cookie found. Expected name=value followed by optional attributes.' };
      const rows: KeyValueRow[] = [
        { key: 'name', label: 'Name', value: attributes.name },
        { key: 'value', label: 'Value', value: attributes.value },
        { key: 'domain', label: 'Domain', value: attributes.domain || '(none)' },
        { key: 'path', label: 'Path', value: attributes.path || '(none)' },
        { key: 'expires', label: 'Expires', value: attributes.expires || '(none)' },
        { key: 'max-age', label: 'Max-Age', value: attributes.maxAge || '(none)' },
        { key: 'secure', label: 'Secure', value: flag(attributes.secure) },
        { key: 'http-only', label: 'HttpOnly', value: flag(attributes.httpOnly) },
        { key: 'same-site', label: 'SameSite', value: attributes.sameSite || '(none)' },
        ...checkSetCookieWarnings(attributes).map((warning, index) => ({ key: `warning-${index}`, label: 'Warning', value: warning })),
        { key: 'header', label: 'Rebuilt header', value: buildSetCookieHeader(attributes) },
      ];
      return { ok: true, output: rows };
    },
  },
];

export default defineTextTool({
  toolId: 'cookie-tools',
  modeKey: 'mode',
  outputKind: 'kv',
  inputLabel: 'Header value',
  modes,
});
