export interface OgSettings {
  readonly title: string;
  readonly description: string;
  readonly image: string;
  readonly url: string;
  readonly siteName: string;
  readonly type: string;
}

export const DEFAULT_OG_SETTINGS: OgSettings = {
  title: '',
  description: '',
  image: '',
  url: '',
  siteName: '',
  type: 'website',
};

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

export function buildOgTags(s: OgSettings): string {
  const lines: string[] = [];
  const push = (property: string, content: string) => {
    if (content.trim() !== '') lines.push(`<meta property="${property}" content="${escapeAttr(content)}">`);
  };

  push('og:title', s.title);
  push('og:description', s.description);
  push('og:image', s.image);
  push('og:url', s.url);
  push('og:site_name', s.siteName);
  push('og:type', s.type);

  if (s.title.trim() !== '' || s.description.trim() !== '' || s.image.trim() !== '') {
    lines.push('<meta name="twitter:card" content="summary_large_image">');
    if (s.title.trim() !== '') lines.push(`<meta name="twitter:title" content="${escapeAttr(s.title)}">`);
    if (s.description.trim() !== '') lines.push(`<meta name="twitter:description" content="${escapeAttr(s.description)}">`);
    if (s.image.trim() !== '') lines.push(`<meta name="twitter:image" content="${escapeAttr(s.image)}">`);
  }

  return lines.join('\n');
}

/** Extracts a bare hostname for the preview card's URL line, matching how social platforms display it (e.g. "example.com" not the full path). */
export function hostnameFor(url: string): string {
  if (url.trim() === '') return '';
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}
