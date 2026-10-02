/**
 * `markdown-it-task-lists` ships no types of its own and has no `@types`
 * package — this is the first ambient module declaration in the codebase.
 */
declare module 'markdown-it-task-lists' {
  import type MarkdownIt from 'markdown-it';

  interface TaskListsOptions {
    enabled?: boolean;
    label?: boolean;
    labelAfter?: boolean;
  }

  function taskLists(md: MarkdownIt, options?: TaskListsOptions): void;

  export default taskLists;
}
