import { convertHexText, type HexTextDirection, type HexTextEncoding } from '@dude/tool-engine/tools/hex-text-converter/hex-text-convert';
import { defineTextTool, type TextToolMode } from '../../kit';

const run = (direction: HexTextDirection): TextToolMode['run'] => (input, options) => {
  const result = convertHexText(input, direction, options['encoding'] as HexTextEncoding);
  return result.ok ? { ok: true, output: result.value } : { ok: false, error: result.error };
};

/** Web keys: `direction` (mode) and `encoding`. The web tool has no separator option. */
export default defineTextTool({
  toolId: 'hex-text-converter',
  modeKey: 'direction',
  swap: true,
  modes: [
    { id: 'toHex', label: 'Text to hex', run: run('toHex') },
    { id: 'toText', label: 'Hex to text', run: run('toText') },
  ],
  options: [{
    kind: 'select', id: 'encoding', key: 'encoding', label: 'Encoding', default: 'utf8',
    choices: [
      { value: 'ascii', label: 'ASCII' },
      { value: 'utf8', label: 'UTF-8' },
      { value: 'utf16le', label: 'UTF-16 LE' },
      { value: 'utf16be', label: 'UTF-16 BE' },
    ],
  }],
});
