import {
  DARK_MARKDOWN_PALETTE,
  buildSandboxedMarkdownDocument,
  resolveMarkdownPalette,
} from "./sandboxed-markdown-preview-doc.js";

describe('buildSandboxedMarkdownDocument', () => {
  it('embeds the given HTML inside the body', () => {
    const doc = buildSandboxedMarkdownDocument('<p>hello</p>', '');
    expect(doc).toContain('<p>hello</p>');
  });

  it('embeds the given CSS inside a style tag', () => {
    const doc = buildSandboxedMarkdownDocument('<p>hello</p>', 'p { color: red; }');
    expect(doc).toContain('p { color: red; }');
  });

  it('includes a restrictive Content-Security-Policy meta tag', () => {
    const doc = buildSandboxedMarkdownDocument('', '');
    expect(doc).toContain('Content-Security-Policy');
    expect(doc).toContain("default-src 'none'");
  });

  it('applies the markdown-body class to the body element', () => {
    const doc = buildSandboxedMarkdownDocument('', '');
    expect(doc).toContain('<body class="markdown-body">');
  });

  it('injects light palette values when the resolved palette is light', () => {
    const doc = buildSandboxedMarkdownDocument('', '', {
      colorScheme: 'light',
      text: '#1a1a1a',
      textMuted: '#555555',
      panelElevated: '#f0f0f0',
      border: '#cccccc',
      accent: '#0b57d0',
    });
    expect(doc).toContain('color-scheme: light');
    expect(doc).toContain('--color-text: #1a1a1a');
    expect(doc).toContain('--color-panel-elevated: #f0f0f0');
    expect(doc).toContain('--color-accent: #0b57d0');
    expect(doc).not.toContain('color-scheme: dark');
    expect(doc).not.toContain('#e5e5e5');
  });

  it('falls back to the dark palette when no palette is given', () => {
    const doc = buildSandboxedMarkdownDocument('', '');
    expect(doc).toContain('color-scheme: dark');
    expect(doc).toContain(`--color-text: ${DARK_MARKDOWN_PALETTE.text}`);
  });

  it('does not hard-code the text color in the body rule', () => {
    const doc = buildSandboxedMarkdownDocument('', '', { colorScheme: 'light', text: '#111111' });
    expect(doc).toContain('color: var(--color-text)');
    expect(doc).not.toMatch(/body \{[^}]*color: #/);
  });
});

describe('resolveMarkdownPalette', () => {
  it('replaces empty values with dark fallbacks', () => {
    const palette = resolveMarkdownPalette({ colorScheme: 'light', text: '', border: '   ' });
    expect(palette.colorScheme).toBe('light');
    expect(palette.text).toBe(DARK_MARKDOWN_PALETTE.text);
    expect(palette.border).toBe(DARK_MARKDOWN_PALETTE.border);
  });

  it('rejects values that could break out of the declaration or style element', () => {
    const palette = resolveMarkdownPalette({ text: 'red;}</style><script>', accent: 'url(x)' });
    expect(palette.text).toBe(DARK_MARKDOWN_PALETTE.text);
    expect(palette.accent).toBe(DARK_MARKDOWN_PALETTE.accent);
  });

  it('defaults an unknown color scheme to dark', () => {
    expect(resolveMarkdownPalette({ colorScheme: 'sepia' as never }).colorScheme).toBe('dark');
  });
});
