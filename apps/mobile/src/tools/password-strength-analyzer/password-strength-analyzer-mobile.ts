import { analyzePassword, type StrengthVerdict } from '@dude/tool-engine/tools/password-strength-analyzer/password-strength-logic';
import type { KeyValueRow } from '../../kit/text-tool-controller';

export const VERDICT_LABELS: Readonly<Record<StrengthVerdict, string>> = {
  'very-weak': 'Very weak', weak: 'Weak', fair: 'Fair', good: 'Good', strong: 'Strong',
};
export const VERDICT_TONES: Readonly<Record<StrengthVerdict, 'error' | 'warning' | 'success'>> = {
  'very-weak': 'error', weak: 'error', fair: 'warning', good: 'success', strong: 'success',
};

export interface StrengthView { readonly verdict: StrengthVerdict; readonly rows: readonly KeyValueRow[] }

/** The analysis as labelled rows (the same fields the web tool shows). Returns null for an empty password. */
export function strengthView(password: string): StrengthView | null {
  if (password === '') return null;
  const analysis = analyzePassword(password);
  return {
    verdict: analysis.verdict,
    rows: [
      { key: 'verdict', label: 'Verdict', value: VERDICT_LABELS[analysis.verdict] },
      { key: 'entropy', label: 'Entropy', value: `${analysis.entropyBits.toFixed(1)} bits` },
      { key: 'length', label: 'Length', value: String(analysis.length) },
      { key: 'charset', label: 'Charset size', value: String(analysis.charsetSize) },
      { key: 'crack-time', label: 'Estimated offline crack time', value: analysis.estimatedCrackTime },
      { key: 'penalties', label: 'Penalties', value: analysis.penalties.length ? analysis.penalties.join('\n') : 'None' },
    ],
  };
}
