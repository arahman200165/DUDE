import { normalizeText, type NormalizationForm } from '@dude/tool-engine/tools/unicode-normalization/unicode-normalize';
import { defineTextTool, type TextToolMode } from '../../kit';

const FORMS: readonly NormalizationForm[] = ['NFC', 'NFD', 'NFKC', 'NFKD'];

/** `String.prototype.normalize` is provided by Hermes itself, so the web engine runs unchanged. Same `form` key as web. */
const modes: readonly TextToolMode[] = FORMS.map(form => ({
  id: form,
  label: form,
  run: input => {
    const result = normalizeText(input, form);
    return {
      ok: true,
      output: [
        { key: 'output', label: `${form} output`, value: result.output },
        {
          key: 'code-points',
          label: 'Code points',
          value: result.changed ? `${result.inputCodePointCount} → ${result.outputCodePointCount}` : `${result.inputCodePointCount} (unchanged)`,
        },
      ],
    };
  },
}));

export default defineTextTool({
  toolId: 'unicode-normalization',
  modeKey: 'form',
  outputKind: 'kv',
  // "café Ⅰ ﬁ" written with escapes so the file stays ASCII: precomposed e-acute, ROMAN NUMERAL ONE, fi ligature.
  sampleInput: 'café Ⅰ ﬁ',
  modes,
});
