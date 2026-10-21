import { processUrl, type UrlEncodeOperation, type UrlEncodeVariant } from '@dude/tool-engine/tools/url-encode/url-encode-codec';
import { defineTextTool, type TextToolMode } from '../../kit';

const run = (operation: UrlEncodeOperation): TextToolMode['run'] => (input, options) => {
  const result = processUrl(input, operation, options['variant'] as UrlEncodeVariant);
  return result.ok ? { ok: true, output: result.value } : { ok: false, error: result.error };
};

/** Web keys: `operation` (mode) and `variant`. */
export default defineTextTool({
  toolId: 'url-encode',
  modeKey: 'operation',
  swap: true,
  modes: [
    { id: 'encode', label: 'Encode', run: run('encode') },
    { id: 'decode', label: 'Decode', run: run('decode') },
  ],
  options: [{
    kind: 'select', id: 'variant', key: 'variant', label: 'Scope', default: 'component',
    choices: [{ value: 'component', label: 'Component' }, { value: 'full', label: 'Full URL' }],
  }],
});
