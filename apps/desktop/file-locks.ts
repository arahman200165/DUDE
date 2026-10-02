/** Case-insensitive Windows path matching for handle-scan results. Folder matches are boundary aware. */
export function lockPathMatches(target: string, candidate: string, folder: boolean): boolean {
  const normalize = (value: string) => value.replaceAll('/', '\\').replace(/\\+$/, '').toLocaleLowerCase('en-US');
  const wanted = normalize(target);
  const actual = normalize(candidate);
  return folder ? actual === wanted || actual.startsWith(`${wanted}\\`) : actual === wanted;
}

export interface LockScanOwner { readonly pid: number; readonly name: string; readonly startKey: string; }
export interface LockScanResult { readonly owners: readonly LockScanOwner[]; readonly partial: boolean; readonly warning?: string; }
