import { combineGitignoreTemplates } from "./gitignore-generator-logic.js";
import { GITIGNORE_TEMPLATES } from "./gitignore-templates-data.js";

describe('combineGitignoreTemplates', () => {
  it('combines two templates with section headers, in the requested order', () => {
    const result = combineGitignoreTemplates(['node', 'macos']);
    expect(result).toContain('### Node ###');
    expect(result).toContain('### macOS ###');
    expect(result.indexOf('### Node ###')).toBeLessThan(result.indexOf('### macOS ###'));
    expect(result).toContain('node_modules/');
    expect(result).toContain('.DS_Store');
  });

  it('returns an empty string for no ids', () => {
    expect(combineGitignoreTemplates([])).toBe('');
  });

  it('ignores an unknown template id', () => {
    expect(combineGitignoreTemplates(['not-a-real-template'])).toBe('');
  });

  it('every bundled template has non-empty content', () => {
    for (const template of GITIGNORE_TEMPLATES) {
      expect(template.content.trim().length).toBeGreaterThan(0);
    }
  });
});
