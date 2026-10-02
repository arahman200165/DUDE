export type PreviewBackground = 'theme' | 'white' | 'dark' | 'checker';

export const PREVIEW_BACKGROUNDS: readonly { readonly id: PreviewBackground; readonly label: string }[] = [
  { id: 'theme', label: 'Theme' },
  { id: 'white', label: 'White' },
  { id: 'dark', label: 'Dark' },
  { id: 'checker', label: 'Checker' },
];

/*
 * White, Dark and the checker tones are deliberately literal, not theme tokens: they exist so a
 * user's document (an HTML page, an SVG, an image with transparency) can be judged against a
 * known neutral regardless of the active app theme. Only `theme` follows the theme.
 */
const PREVIEW_WHITE = '#ffffff';
const PREVIEW_DARK = '#1a1a1a';
const CHECKER_LIGHT = '#ffffff';
const CHECKER_DARK = '#cccccc';
const CHECKER_SIZE = '16px 16px';

export interface PreviewBackgroundStyle {
  readonly backgroundColor: string;
  readonly backgroundImage: string;
  readonly backgroundSize: string;
}

const NONE = 'none';

/** Coerces persisted/untrusted data to a known mode; anything unknown becomes `theme`. */
export function normalizePreviewBackground(value: unknown): PreviewBackground {
  return PREVIEW_BACKGROUNDS.some((entry) => entry.id === value) ? (value as PreviewBackground) : 'theme';
}

/** The inline background style for a mode, applied to the element that frames the preview. */
export function previewBackgroundStyle(mode: PreviewBackground): PreviewBackgroundStyle {
  switch (mode) {
    case 'white':
      return { backgroundColor: PREVIEW_WHITE, backgroundImage: NONE, backgroundSize: 'auto' };
    case 'dark':
      return { backgroundColor: PREVIEW_DARK, backgroundImage: NONE, backgroundSize: 'auto' };
    case 'checker':
      return {
        backgroundColor: CHECKER_LIGHT,
        backgroundImage: `repeating-conic-gradient(${CHECKER_DARK} 0% 25%, ${CHECKER_LIGHT} 0% 50%)`,
        backgroundSize: CHECKER_SIZE,
      };
    default:
      return { backgroundColor: 'var(--color-panel)', backgroundImage: NONE, backgroundSize: 'auto' };
  }
}
