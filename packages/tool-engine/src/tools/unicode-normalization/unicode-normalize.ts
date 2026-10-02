export type NormalizationForm = 'NFC' | 'NFD' | 'NFKC' | 'NFKD';

export interface NormalizationResult {
  readonly output: string;
  readonly inputCodePointCount: number;
  readonly outputCodePointCount: number;
  readonly changed: boolean;
}

export function normalizeText(input: string, form: NormalizationForm): NormalizationResult {
  const output = input.normalize(form);
  return {
    output,
    inputCodePointCount: Array.from(input).length,
    outputCodePointCount: Array.from(output).length,
    changed: output !== input,
  };
}
