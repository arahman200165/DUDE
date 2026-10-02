export type MarkdownPluginKind = 'render-hook' | 'toolbar-action';

export interface MarkdownPluginManifest {
  readonly id: string;
  readonly name: string;
  readonly kind: MarkdownPluginKind;
  readonly description?: string;
  /** Plugin JS source; must define a global `run(input)` function returning a string. */
  readonly source: string;
}
