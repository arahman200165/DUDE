export interface MetaTagSettings {
  readonly title: string;
  readonly description: string;
  readonly charset: string;
  readonly viewport: string;
  readonly robots: string;
  readonly canonical: string;
  readonly author: string;
  readonly themeColor: string;
}

export const DEFAULT_META_SETTINGS: MetaTagSettings = {
  title: '',
  description: '',
  charset: 'UTF-8',
  viewport: 'width=device-width, initial-scale=1',
  robots: '',
  canonical: '',
  author: '',
  themeColor: '',
};

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function escapeText(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function buildMetaTags(s: MetaTagSettings): string {
  const lines: string[] = [];
  if (s.charset.trim() !== '') lines.push(`<meta charset="${escapeAttr(s.charset)}">`);
  if (s.viewport.trim() !== '') lines.push(`<meta name="viewport" content="${escapeAttr(s.viewport)}">`);
  if (s.title.trim() !== '') lines.push(`<title>${escapeText(s.title)}</title>`);
  if (s.description.trim() !== '') lines.push(`<meta name="description" content="${escapeAttr(s.description)}">`);
  if (s.author.trim() !== '') lines.push(`<meta name="author" content="${escapeAttr(s.author)}">`);
  if (s.robots.trim() !== '') lines.push(`<meta name="robots" content="${escapeAttr(s.robots)}">`);
  if (s.themeColor.trim() !== '') lines.push(`<meta name="theme-color" content="${escapeAttr(s.themeColor)}">`);
  if (s.canonical.trim() !== '') lines.push(`<link rel="canonical" href="${escapeAttr(s.canonical)}">`);
  return lines.join('\n');
}
