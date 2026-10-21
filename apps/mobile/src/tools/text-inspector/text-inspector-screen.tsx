import { computeTextMetrics } from '@dude/tool-engine/tools/text-inspector/text-metrics';
import { computeReadability, readingEaseLabel } from '@dude/tool-engine/tools/text-inspector/readability';
import { detectLanguage, MIN_DETECTION_LENGTH } from '@dude/tool-engine/tools/text-inspector/language-detect';
import { defineTextTool, type TextToolMode } from '../../kit';

/**
 * Mirrors the web panels (metrics, readability, language). The web grammar check needs the network (LanguageTool) and the
 * web selection metrics need a text-selection API the kit does not expose, so neither is offered here. The engine has no
 * grapheme count (no Intl.Segmenter), so none is shown. Preferences are `none` on web, so the view is memory-only.
 */
const modes: readonly TextToolMode[] = [
  {
    id: 'metrics',
    label: 'Metrics',
    run: input => {
      const metrics = computeTextMetrics(input);
      return {
        ok: true,
        output: [
          { key: 'characters', label: 'Characters', value: String(metrics.characterCount) },
          { key: 'code-points', label: 'Code points', value: String(metrics.codePointCount) },
          { key: 'words', label: 'Words', value: String(metrics.wordCount) },
          { key: 'lines', label: 'Lines', value: String(metrics.lineCount) },
          { key: 'bytes', label: 'UTF-8 bytes', value: String(metrics.byteCount) },
          { key: 'whitespace', label: 'Whitespace', value: String(metrics.whitespaceCount) },
        ],
      };
    },
  },
  {
    id: 'readability',
    label: 'Readability',
    run: input => {
      const score = computeReadability(input);
      if (!score) return { ok: false, error: 'Not enough text (needs at least one sentence) to score readability.' };
      return {
        ok: true,
        output: [
          { key: 'reading-ease', label: 'Flesch Reading Ease', value: `${score.fleschReadingEase} (${readingEaseLabel(score.fleschReadingEase)})` },
          { key: 'grade', label: 'Flesch-Kincaid Grade', value: String(score.fleschKincaidGrade) },
          { key: 'sentences', label: 'Sentences', value: String(score.sentenceCount) },
          { key: 'syllables', label: 'Syllables', value: String(score.syllableCount) },
        ],
      };
    },
  },
  {
    id: 'language',
    label: 'Language',
    run: input => {
      const guesses = detectLanguage(input);
      if (guesses.length === 0) return { ok: false, error: `Not enough text to detect a language (needs at least ${MIN_DETECTION_LENGTH} characters).` };
      return {
        ok: true,
        output: guesses.map(guess => ({ key: `lang-${guess.code}`, label: guess.name, value: `${(guess.score * 100).toFixed(0)}%` })),
      };
    },
  },
];

export default defineTextTool({
  toolId: 'text-inspector',
  modeKey: 'view',
  outputKind: 'kv',
  inputLabel: 'Text',
  sampleInput: 'The quick brown fox jumps over the lazy dog.',
  modes,
});
