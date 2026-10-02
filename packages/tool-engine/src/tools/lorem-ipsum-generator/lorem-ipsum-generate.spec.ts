import { generateLorem } from "./lorem-ipsum-generate.js";

describe('generateLorem — classic source', () => {
  it('generates the requested number of words as a single line', () => {
    const result = generateLorem({ source: 'classic', unit: 'words', count: 5, format: 'plain' });
    expect(result.split(' ')).toHaveLength(5);
  });

  it('generates the requested number of sentences', () => {
    const result = generateLorem({ source: 'classic', unit: 'sentences', count: 2, format: 'plain' });
    expect(result.split('\n\n')).toHaveLength(2);
    expect(result).toContain('Lorem ipsum');
  });

  it('generates the requested number of paragraphs', () => {
    const result = generateLorem({ source: 'classic', unit: 'paragraphs', count: 3, format: 'plain' });
    expect(result.split('\n\n')).toHaveLength(3);
  });

  it('cycles through the source words when more are requested than exist', () => {
    const result = generateLorem({ source: 'classic', unit: 'words', count: 200, format: 'plain' });
    expect(result.split(' ')).toHaveLength(200);
  });

  it('formats as an HTML list', () => {
    const result = generateLorem({ source: 'classic', unit: 'sentences', count: 2, format: 'html-list' });
    expect(result).toMatch(/^<ul>\n {2}<li>.*<\/li>\n {2}<li>.*<\/li>\n<\/ul>$/s);
  });

  it('formats as a Markdown list', () => {
    const result = generateLorem({ source: 'classic', unit: 'words', count: 3, format: 'markdown-list' });
    expect(result.split('\n')).toHaveLength(3);
    expect(result.split('\n').every((line) => line.startsWith('- '))).toBe(true);
  });

  it('clamps a non-positive count to at least 1', () => {
    expect(generateLorem({ source: 'classic', unit: 'words', count: 0, format: 'plain' }).split(' ')).toHaveLength(1);
    expect(generateLorem({ source: 'classic', unit: 'words', count: -5, format: 'plain' }).split(' ')).toHaveLength(1);
  });
});

describe('generateLorem — faker source', () => {
  it('generates the requested number of words', () => {
    const result = generateLorem({ source: 'faker', unit: 'words', count: 6, format: 'plain' });
    expect(result.split(' ')).toHaveLength(6);
  });

  it('generates the requested number of sentences', () => {
    const result = generateLorem({ source: 'faker', unit: 'sentences', count: 3, format: 'plain' });
    expect(result.split('\n\n')).toHaveLength(3);
  });

  it('generates the requested number of paragraphs', () => {
    const result = generateLorem({ source: 'faker', unit: 'paragraphs', count: 2, format: 'plain' });
    expect(result.split('\n\n')).toHaveLength(2);
  });
});
