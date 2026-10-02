import type { WalkEntry } from "./fs-types.js";
import { buildTree, countTree, DEFAULT_TREE_OPTIONS, renderTree } from "@dude/tool-engine/tools/directory-tree-generator/tree-format";

const entry = (path: string, kind: WalkEntry['kind'] = 'file', size = 10): WalkEntry => ({ path, kind, size: kind === 'dir' ? 0 : size, mtimeMs: 0, depth: path.split('/').length - 1 });
const entries: WalkEntry[] = [
  entry('src', 'dir'), entry('src/app.ts'), entry('src/lib', 'dir'), entry('src/lib/util.ts', 'file', 30),
  entry('README.md', 'file', 5), entry('docs', 'dir'), { ...entry('link', 'link'), linkTarget: 'src' },
];
const tree = buildTree(entries, 'repo');

describe('directory tree rendering', () => {
  it("renders the classic `tree` layout (like `tree /F`), directories first, with a summary line", () => {
    expect(renderTree(tree, { ...DEFAULT_TREE_OPTIONS, rootName: 'repo' })).toBe([
      'repo',
      '├── docs/',
      '├── src/',
      '│   ├── lib/',
      '│   │   └── util.ts',
      '│   └── app.ts',
      '├── link -> src',
      '└── README.md',
      '',
      '3 directories, 4 files',
      '',
    ].join('\n'));
  });

  it('supports ASCII, directories-only, size annotation, and size sorting', () => {
    const text = renderTree(tree, { ...DEFAULT_TREE_OPTIONS, format: 'ascii', dirsOnly: true, showSizes: true, sort: 'size', rootName: 'repo' });
    expect(text).toContain('|-- src/ (40 B)');
    expect(text).toContain('|   `-- lib/ (30 B)');
    expect(text).toContain('`-- docs/ (0 B)');
    expect(text).not.toContain('app.ts');
    expect(text).toContain('3 directories\n');
    expect(countTree(tree, { dirsOnly: false })).toEqual({ dirs: 3, files: 4 });
  });

  it('emits Markdown, JSON, HTML, Mermaid, and PlantUML', () => {
    const base = { ...DEFAULT_TREE_OPTIONS, rootName: 'repo' };
    expect(renderTree(tree, { ...base, format: 'markdown' })).toContain('    - `util.ts`');
    const json = JSON.parse(renderTree(tree, { ...base, format: 'json' }));
    expect(json.children.find((child: { name: string }) => child.name === 'src').children[0]).toMatchObject({ name: 'lib', type: 'directory' });
    expect(renderTree(tree, { ...base, format: 'html' })).toContain('<details open><summary>repo</summary>');
    expect(renderTree(buildTree([entry('a<b>.txt')], 'r'), { ...base, format: 'html' })).toContain('a&lt;b&gt;.txt');
    const mermaid = renderTree(tree, { ...base, format: 'mermaid' });
    expect(mermaid.split('\n').slice(0, 3)).toEqual(['mindmap', '  root["repo"]', '    ["docs/"]']);
    const puml = renderTree(tree, { ...base, format: 'plantuml' });
    expect(puml).toContain('*** lib/');
    expect(puml).toContain('****_ util.ts');
    expect(puml.trim().endsWith('@endmindmap')).toBe(true);
  });
});
