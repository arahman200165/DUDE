export type UrlEncodeVariant = 'component' | 'full';
export type UrlEncodeOperation = 'encode' | 'decode';

export type UrlEncodeResult =
  | { readonly ok: true; readonly value: string }
  | { readonly ok: false; readonly error: string };

export function encodeUrl(text: string, variant: UrlEncodeVariant): UrlEncodeResult {
  try {
    return { ok: true, value: variant === 'component' ? encodeURIComponent(text) : encodeURI(text) };
  } catch {
    return { ok: false, error: 'Could not encode this text as a URL — it contains an invalid character.' };
  }
}

export function decodeUrl(text: string, variant: UrlEncodeVariant): UrlEncodeResult {
  try {
    return { ok: true, value: variant === 'component' ? decodeURIComponent(text) : decodeURI(text) };
  } catch {
    return { ok: false, error: 'Invalid percent-encoding in this input.' };
  }
}

export function processUrl(text: string, operation: UrlEncodeOperation, variant: UrlEncodeVariant): UrlEncodeResult {
  return operation === 'encode' ? encodeUrl(text, variant) : decodeUrl(text, variant);
}
