import { InjectionToken } from '@angular/core';
import type { CodeEditorEngine } from './code-editor.model';

/**
 * Loads the CodeMirror chunk. The one dynamic `import()` of the engine lives here, so nothing that imports
 * `<app-code-editor>` pulls CodeMirror into its own chunk. A rejection makes the editor keep its plain textarea,
 * which is also what an offline first visit without the chunk cached gets.
 *
 * jsdom cannot lay out text, so unit tests of the surfaces that host the editor never load the engine and
 * exercise the textarea path (the component and engine specs provide their own loader or import the engine).
 */
export const CODE_EDITOR_ENGINE_LOADER = new InjectionToken<() => Promise<CodeEditorEngine>>('CODE_EDITOR_ENGINE_LOADER', {
  providedIn: 'root',
  factory: () => () =>
    typeof navigator !== 'undefined' && navigator.userAgent.includes('jsdom')
      ? Promise.reject(new Error('The editor engine is not loaded in jsdom.'))
      : import('./code-editor.engine'),
});
