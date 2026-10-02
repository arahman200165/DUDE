/** Both ROT13 and ROT47 are self-inverse -- applying the same transform twice returns the original text. */
export type RotMode = 'rot13' | 'rot47';

export function applyRot(text: string, mode: RotMode): string {
  return mode === 'rot13' ? rot13(text) : rot47(text);
}

function rot13(text: string): string {
  return text.replace(/[a-zA-Z]/g, (char) => {
    const base = char <= 'Z' ? 65 : 97;
    return String.fromCharCode(((char.charCodeAt(0) - base + 13) % 26) + base);
  });
}

function rot47(text: string): string {
  let out = '';
  for (const char of text) {
    const code = char.charCodeAt(0);
    out += code >= 33 && code <= 126 ? String.fromCharCode(33 + ((code - 33 + 47) % 94)) : char;
  }
  return out;
}
