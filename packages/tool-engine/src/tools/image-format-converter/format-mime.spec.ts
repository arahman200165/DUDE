import { describe, expect, it } from 'vitest';
import { extensionForFormat, replaceExtension } from "./format-mime.js";

describe('extensionForFormat', () => {
  it('maps each supported MIME type to its extension', () => {
    expect(extensionForFormat('image/png')).toBe('png');
    expect(extensionForFormat('image/jpeg')).toBe('jpg');
    expect(extensionForFormat('image/webp')).toBe('webp');
    expect(extensionForFormat('image/avif')).toBe('avif');
  });
});

describe('replaceExtension', () => {
  it('replaces an existing extension', () => {
    expect(replaceExtension('photo.png', 'image/webp')).toBe('photo.webp');
  });

  it('appends an extension when the filename has none', () => {
    expect(replaceExtension('photo', 'image/jpeg')).toBe('photo.jpg');
  });
});
