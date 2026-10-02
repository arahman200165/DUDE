
export function MockDataStudio_toDisplayValue(value: unknown): string {
    if (value instanceof Date)
        return value.toISOString();
    if (value === null || value === undefined)
        return '';
    return String(value);
}
