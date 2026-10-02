import { francAll } from 'franc-min';

/**
 * Thin wrapper over `franc-min` — a small trigram-based library, chosen
 * because hand-rolling per-language trigram frequency tables is real
 * data-engineering work, not a quick fix (the project's "library-forward"
 * exception applies here, same as `colord`/`@sindresorhus/slugify`).
 */

export interface LanguageGuess {
  readonly code: string;
  readonly name: string;
  readonly score: number;
}

/** ISO 639-3 → display name for franc-min's supported language set (script variants collapsed to one name each). */
const LANGUAGE_NAMES: Record<string, string> = {
  cmn: 'Mandarin Chinese', spa: 'Spanish', eng: 'English', rus: 'Russian', arb: 'Standard Arabic',
  ben: 'Bengali', hin: 'Hindi', por: 'Portuguese', ind: 'Indonesian', jpn: 'Japanese',
  fra: 'French', deu: 'German', jav: 'Javanese', kor: 'Korean', tel: 'Telugu',
  vie: 'Vietnamese', mar: 'Marathi', ita: 'Italian', tam: 'Tamil', tur: 'Turkish',
  urd: 'Urdu', guj: 'Gujarati', pol: 'Polish', ukr: 'Ukrainian', kan: 'Kannada',
  mai: 'Maithili', mal: 'Malayalam', pes: 'Iranian Persian', mya: 'Burmese', swh: 'Swahili',
  sun: 'Sundanese', ron: 'Romanian', pan: 'Punjabi', bho: 'Bhojpuri', amh: 'Amharic',
  hau: 'Hausa', fuv: 'Nigerian Fulfulde', bos: 'Bosnian', hrv: 'Croatian', nld: 'Dutch',
  srp: 'Serbian', tha: 'Thai', ckb: 'Central Kurdish', yor: 'Yoruba', uzn: 'Northern Uzbek',
  zlm: 'Malay', ibo: 'Igbo', npi: 'Nepali', ceb: 'Cebuano', skr: 'Saraiki',
  tgl: 'Tagalog', hun: 'Hungarian', azj: 'North Azerbaijani', sin: 'Sinhala', koi: 'Komi-Permyak',
  ell: 'Modern Greek', ces: 'Czech', mag: 'Magahi', run: 'Rundi', bel: 'Belarusian',
  plt: 'Plateau Malagasy', qug: 'Chimborazo Highland Quichua', mad: 'Madurese', nya: 'Nyanja',
  zyb: 'Yongbei Zhuang', pbu: 'Northern Pashto', kin: 'Kinyarwanda', zul: 'Zulu', bul: 'Bulgarian',
  swe: 'Swedish', lin: 'Lingala', som: 'Somali', hms: 'Southern Qiandong Miao', hnj: 'Hmong Njua',
  ilo: 'Iloko', kaz: 'Kazakh', und: 'Undetermined',
};

/** franc-min needs a minimum amount of text to be meaningful. */
export const MIN_DETECTION_LENGTH = 10;
/** Language ID gets no more accurate on very long input and is O(n) — cap the analyzed prefix. */
const MAX_DETECTION_LENGTH = 5000;

function languageName(code: string): string {
  return LANGUAGE_NAMES[code] ?? code;
}

export function detectLanguage(text: string): readonly LanguageGuess[] {
  const trimmed = text.trim();
  if (trimmed.length < MIN_DETECTION_LENGTH) return [];

  const guesses = francAll(trimmed.slice(0, MAX_DETECTION_LENGTH));
  return guesses
    .filter(([code]) => code !== 'und')
    .slice(0, 5)
    .map(([code, score]) => ({ code, name: languageName(code), score }));
}
