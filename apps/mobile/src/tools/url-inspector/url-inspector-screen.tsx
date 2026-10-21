import { parseUrl } from '@dude/tool-engine/tools/url-inspector/url-parts';
import { defineTextTool, type KeyValueRow } from '../../kit';

/**
 * Read-only inspector: the web tool's editable parts form is not mirrored (the kit has no structured editors), the
 * components and each query parameter are shown as copyable rows. Input is session-scoped on web, so memory-only here.
 */
export default defineTextTool({
  toolId: 'url-inspector',
  outputKind: 'kv',
  inputLabel: 'URL',
  sampleInput: 'https://user@example.com:8443/a/b?x=1&y=2#section',
  run: input => {
    const result = parseUrl(input);
    if (!result.ok) return { ok: false, error: result.error };
    const { parts } = result;
    const rows: KeyValueRow[] = [
      { key: 'protocol', label: 'Scheme', value: parts.protocol },
      { key: 'username', label: 'Username', value: parts.username || '(none)' },
      { key: 'password', label: 'Password', value: parts.password || '(none)' },
      { key: 'hostname', label: 'Host', value: parts.hostname || '(none)' },
      { key: 'port', label: 'Port', value: parts.port || '(default)' },
      { key: 'pathname', label: 'Path', value: parts.pathname },
      { key: 'hash', label: 'Fragment', value: parts.hash || '(none)' },
      { key: 'origin', label: 'Origin', value: parts.origin },
      ...parts.queryParams.map((pair, index) => ({ key: `query-${index}`, label: `Query: ${pair.key}`, value: pair.value })),
    ];
    return { ok: true, output: rows };
  },
});
