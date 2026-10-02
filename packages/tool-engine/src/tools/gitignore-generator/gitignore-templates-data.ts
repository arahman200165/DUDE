/** Bundled, curated `.gitignore` templates — offline by design (no live GitHub gitignore-API fetch), mirroring the flat-array reference-data pattern used by Dev Snippets Reference. */

export interface GitignoreTemplate {
  readonly id: string;
  readonly label: string;
  readonly content: string;
}

export const GITIGNORE_TEMPLATES: readonly GitignoreTemplate[] = [
  {
    id: 'node',
    label: 'Node',
    content: `node_modules/
npm-debug.log*
yarn-debug.log*
yarn-error.log*
.pnpm-debug.log*
dist/
build/
coverage/
.env
.env.local
*.tsbuildinfo`,
  },
  {
    id: 'python',
    label: 'Python',
    content: `__pycache__/
*.py[cod]
*$py.class
*.egg-info/
.eggs/
.venv/
venv/
env/
.mypy_cache/
.pytest_cache/
.tox/
dist/
build/
*.egg`,
  },
  {
    id: 'java',
    label: 'Java',
    content: `*.class
*.jar
*.war
*.ear
target/
.gradle/
build/
!gradle/wrapper/gradle-wrapper.jar
hs_err_pid*`,
  },
  {
    id: 'dotnet',
    label: '.NET',
    content: `bin/
obj/
*.user
*.suo
.vs/
*.dbmdl
*.pdb
[Dd]ebug/
[Rr]elease/
project.lock.json`,
  },
  {
    id: 'go',
    label: 'Go',
    content: `*.exe
*.exe~
*.dll
*.so
*.dylib
*.test
*.out
vendor/
go.work`,
  },
  {
    id: 'rust',
    label: 'Rust',
    content: `/target/
**/*.rs.bk
Cargo.lock`,
  },
  {
    id: 'macos',
    label: 'macOS',
    content: `.DS_Store
.AppleDouble
.LSOverride
._*
.Spotlight-V100
.Trashes`,
  },
  {
    id: 'windows',
    label: 'Windows',
    content: `Thumbs.db
ehthumbs.db
Desktop.ini
$RECYCLE.BIN/
*.lnk`,
  },
  {
    id: 'jetbrains',
    label: 'JetBrains IDEs',
    content: `.idea/
*.iml
*.iws
out/`,
  },
  {
    id: 'vscode',
    label: 'VS Code',
    content: `.vscode/*
!.vscode/settings.json
!.vscode/tasks.json
!.vscode/launch.json
!.vscode/extensions.json
*.code-workspace`,
  },
];
