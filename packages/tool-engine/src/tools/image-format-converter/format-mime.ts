/** Pure MIME <-> file-extension mapping for the formats this tool converts between. */

export type ImageOutputFormat = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/avif';

const EXTENSIONS: Record<ImageOutputFormat, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
};

export function extensionForFormat(format: ImageOutputFormat): string {
  return EXTENSIONS[format];
}

export function replaceExtension(filename: string, format: ImageOutputFormat): string {
  return filename.replace(/\.\w+$/, '') + '.' + extensionForFormat(format);
}
