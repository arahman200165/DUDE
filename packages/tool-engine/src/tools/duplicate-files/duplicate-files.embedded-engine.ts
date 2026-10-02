
export function DuplicateFilesTool_date(mtimeMs: number): string { return new Date(mtimeMs).toISOString().slice(0, 16).replace('T', ' '); }
