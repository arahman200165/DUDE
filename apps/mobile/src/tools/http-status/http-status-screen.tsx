import { HTTP_STATUS_CODES } from '@dude/tool-engine/shared/utils/http-status-codes';
import { filterHttpStatusCodes } from '@dude/tool-engine/tools/http-status/http-status-search';
import { defineTextTool, type KeyValueRow } from '../../kit';

/** Same filter as web (code/name/description substring); web key `filterText` is the input, which is memory-only here. */
export default defineTextTool({
  toolId: 'http-status',
  outputKind: 'kv',
  inputLabel: 'Status code or text',
  run: input => {
    const rows: KeyValueRow[] = filterHttpStatusCodes(HTTP_STATUS_CODES, input).flatMap(group => group.entries.map(entry => ({
      key: `status-${entry.code}`,
      label: `${entry.code} ${entry.name} (${group.category})`,
      value: entry.description,
    })));
    if (rows.length === 0) return { ok: false, error: `No status code matches "${input.trim()}".` };
    return { ok: true, output: rows };
  },
});
