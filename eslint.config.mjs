// Dependency/platform boundary enforcement (DUDE_PRD.md §21 Phase 22 Item 10). Deliberately
// narrow — this is not a general style/quality linter (Prettier already owns formatting, and
// PRD §18 is "ship first, protect the framework, not chase coverage"). It exists purely to
// mechanically enforce boundaries that were previously convention/AGENTS.md-prose-only:
//
// - src/app/** (the Angular renderer) must never runtime-import electron/** — see
//   electron/AGENTS.md: "the Angular renderer never imports from here."
// - electron/** (the Electron main/preload processes) must never runtime-import src/app/** —
//   same file: "the two processes only ever talk over contextBridge/IPC."
// - src/shared-logic/** must stay framework/DOM-free — see src/shared-logic/AGENTS.md: "No
//   Angular imports... no DOM-only globals... only globals available in both a browser tab
//   and Node."
//
// Type-only imports are exempt on both sides of the app/electron boundary (e.g. preload.ts's
// `import type { DudeElectronBridge } from '../src/app/core/platform/electron-bridge'` is
// fine and erased at build time — only a runtime import crosses the process boundary).

import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

const NO_ELECTRON_IMPORT = {
  group: ['**/electron/**', '**/electron'],
  message: 'src/app/ must never runtime-import from electron/ (electron/AGENTS.md) — use a type-only import if you only need a type.',
  allowTypeImports: true,
};

const NO_APP_IMPORT = {
  group: ['**/src/app/**'],
  message: 'electron/ must never runtime-import from src/app/ (electron/AGENTS.md) — the renderer and main process only talk over contextBridge/IPC. Use a type-only import if you only need a type.',
  allowTypeImports: true,
};

const NO_ANGULAR_IMPORT = {
  group: ['@angular/*', '@angular/**'],
  message: 'src/shared-logic/ must stay framework-free (src/shared-logic/AGENTS.md) — no @angular/* imports.',
};

export default [
  {
    ignores: ['dist/**', 'dist-*/**', 'node_modules/**', '.angular/**', 'coverage/**'],
  },
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: { sourceType: 'module' },
    },
    plugins: { '@typescript-eslint': tsPlugin },
  },
  {
    files: ['src/app/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [NO_ELECTRON_IMPORT] }],
    },
  },
  {
    files: ['electron/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [NO_APP_IMPORT] }],
    },
  },
  {
    files: ['src/shared-logic/**/*.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { patterns: [NO_ANGULAR_IMPORT] }],
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'src/shared-logic/ must stay DOM-free (src/shared-logic/AGENTS.md).' },
        { name: 'document', message: 'src/shared-logic/ must stay DOM-free (src/shared-logic/AGENTS.md).' },
        { name: 'localStorage', message: 'src/shared-logic/ must stay DOM-free (src/shared-logic/AGENTS.md).' },
        { name: 'sessionStorage', message: 'src/shared-logic/ must stay DOM-free (src/shared-logic/AGENTS.md).' },
      ],
    },
  },
];
