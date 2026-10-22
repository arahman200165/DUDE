import { mobileDeepLinkPath } from '../src/navigation/deep-links';

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  // Measurement builds only (EXPO_PUBLIC_DUDE_MEASURE=1, inlined at build time): dude://dev/measure[?scope=...] opens the harness.
  // In every other build this block is folded away and the link falls through to the navigation-only parser below.
  if (process.env.EXPO_PUBLIC_DUDE_MEASURE === '1') {
    const match = /^(?:dude:\/\/dev\/measure|\/dev\/measure)(?:\?scope=(all|smoke|json-peak|idle|sweep))?\/?$/.exec(path);
    if (match) return match[1] ? `/dev/measure?scope=${match[1]}` : '/dev/measure';
  }
  return mobileDeepLinkPath(path) ?? '/(tabs)';
}
