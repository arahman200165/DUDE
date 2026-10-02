/** Preserve the browser parser and serializer used by the existing entity codec. */
export function htmlEntities(input: string, mode: 'encode' | 'decode'): string {
  if (mode === 'decode') {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = input;
    return textarea.value;
  }
  const container = document.createElement('div');
  container.textContent = input;
  return container.innerHTML;
}
