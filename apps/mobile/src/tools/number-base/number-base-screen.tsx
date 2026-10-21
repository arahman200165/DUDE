import { clampBase } from '@dude/tool-engine/tools/number-base/number-base.embedded-engine';
import { formatInBase, parseInBase } from '@dude/tool-engine/tools/number-base/number-base-convert';
import { defineTextTool } from '../../kit';

/**
 * Mirrors the web quick fields (binary/octal/decimal/hex) plus its custom from/to base converter. The web tool persists
 * only the value, so `fromBase`/`toBase` are in-memory options (manifest preferences: 'none').
 */
export default defineTextTool({
  toolId: 'number-base',
  outputKind: 'kv',
  inputLabel: 'Number',
  options: [
    { kind: 'number', id: 'fromBase', label: 'Input base', default: 10, min: 2, max: 36 },
    { kind: 'number', id: 'toBase', label: 'Custom output base', default: 36, min: 2, max: 36 },
  ],
  run: (input, options) => {
    const fromBase = clampBase(Number(options['fromBase']));
    const toBase = clampBase(Number(options['toBase']));
    const parsed = parseInBase(input, fromBase);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    return {
      ok: true,
      output: [
        { key: 'bin', label: 'Binary (2)', value: formatInBase(parsed.value, 2) },
        { key: 'oct', label: 'Octal (8)', value: formatInBase(parsed.value, 8) },
        { key: 'dec', label: 'Decimal (10)', value: formatInBase(parsed.value, 10) },
        { key: 'hex', label: 'Hex (16)', value: formatInBase(parsed.value, 16) },
        { key: 'custom', label: `Base ${toBase}`, value: formatInBase(parsed.value, toBase) },
      ],
    };
  },
});
