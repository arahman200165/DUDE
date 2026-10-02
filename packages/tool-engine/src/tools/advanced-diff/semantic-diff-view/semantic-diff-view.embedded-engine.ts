
export function formatValue(value: unknown): string {
    if (value === undefined)
        return '';
    return typeof value === 'string' ? value : JSON.stringify(value);
}
