import { CASE_STYLE_OPTIONS, convertCase } from '@dude/tool-engine/tools/case-converter/case-convert';
import { defineTextTool } from '../../kit';

/** Same `style` preference key as the web tool; the mode ids are the engine's CaseStyle values. */
export default defineTextTool({
  toolId: 'case-converter',
  modeKey: 'style',
  swap: true,
  sampleInput: 'Hello World Example',
  modes: CASE_STYLE_OPTIONS.map(option => ({
    id: option.style,
    label: option.label,
    run: input => ({ ok: true, output: convertCase(input, option.style) }),
  })),
});
