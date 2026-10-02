/** `unicode-name` ships no types of its own and has no `@types` package. */
declare module 'unicode-name' {
  export function unicodeName(char: string | number): string | undefined;
}
