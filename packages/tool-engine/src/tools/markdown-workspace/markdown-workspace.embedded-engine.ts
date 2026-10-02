
export function MarkdownWorkspace_formatFrontMatterValue(value: unknown): string {
    return typeof value === 'string' ? value : JSON.stringify(value);
}
