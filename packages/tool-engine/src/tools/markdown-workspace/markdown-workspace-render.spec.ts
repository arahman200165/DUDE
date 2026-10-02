import { buildWorkspaceResult } from "./markdown-workspace-render.js";

describe('buildWorkspaceResult — front matter', () => {
  it('parses a valid leading front-matter block', () => {
    const result = buildWorkspaceResult('---\ntitle: Hello\ndraft: true\n---\n\n# Body\n');
    expect(result.frontMatter).toEqual({ title: 'Hello', draft: true });
    expect(result.frontMatterError).toBeNull();
    expect(result.renderedHtmlRaw).toContain('Body');
    expect(result.renderedHtmlRaw).not.toContain('title:');
  });

  it('returns null front matter when the document has none', () => {
    const result = buildWorkspaceResult('# Just a heading\n');
    expect(result.frontMatter).toBeNull();
    expect(result.frontMatterError).toBeNull();
  });

  it('reports a front-matter error for malformed YAML without breaking the body render', () => {
    const result = buildWorkspaceResult('---\nkey: [unterminated\n---\n\n# Body\n');
    expect(result.frontMatter).toBeNull();
    expect(result.frontMatterError).toBeTruthy();
    expect(result.renderedHtmlRaw).toContain('Body');
  });

  it('does not misdetect a body-leading horizontal rule as front matter', () => {
    // The document does NOT start with `---` at index 0 (a blank line precedes it),
    // so this must render as an <hr>, not be parsed as front matter.
    const result = buildWorkspaceResult('\n---\n\nSome text\n');
    expect(result.frontMatter).toBeNull();
    expect(result.renderedHtmlRaw).toContain('<hr');
  });
});

describe('buildWorkspaceResult — GFM extras', () => {
  it('renders GFM tables', () => {
    const result = buildWorkspaceResult('| a | b |\n| - | - |\n| 1 | 2 |\n');
    expect(result.renderedHtmlRaw).toContain('<table>');
  });

  it('renders strikethrough', () => {
    const result = buildWorkspaceResult('~~gone~~');
    expect(result.renderedHtmlRaw).toContain('<s>gone</s>');
  });

  it('renders task list items with checked/unchecked checkboxes', () => {
    const result = buildWorkspaceResult('- [ ] todo\n- [x] done\n');
    expect(result.renderedHtmlRaw).toContain('type="checkbox"');
    expect(result.renderedHtmlRaw).toContain('checked');
  });

  it('still escapes raw HTML in the body (html: false)', () => {
    const result = buildWorkspaceResult('<script>alert(1)</script>');
    expect(result.renderedHtmlRaw).not.toContain('<script>');
    expect(result.renderedHtmlRaw).toContain('&lt;script&gt;');
  });
});

describe('buildWorkspaceResult — table of contents', () => {
  it('extracts headings with levels and stamps matching ids on the rendered output', () => {
    const result = buildWorkspaceResult('# Title\n\n## Section One\n\n## Section One\n');

    expect(result.toc).toEqual([
      { level: 1, text: 'Title', slug: 'title' },
      { level: 2, text: 'Section One', slug: 'section-one' },
      { level: 2, text: 'Section One', slug: 'section-one-1' },
    ]);
    expect(result.renderedHtmlRaw).toContain('id="title"');
    expect(result.renderedHtmlRaw).toContain('id="section-one"');
    expect(result.renderedHtmlRaw).toContain('id="section-one-1"');
  });

  it('returns an empty TOC for a document with no headings', () => {
    expect(buildWorkspaceResult('just a paragraph').toc).toEqual([]);
  });
});

describe('buildWorkspaceResult — stats', () => {
  it('computes stats over the whole source, including the body text', () => {
    const result = buildWorkspaceResult('---\ntitle: x\n---\n\none two three\n');
    expect(result.stats.words).toBeGreaterThanOrEqual(3);
  });
});
