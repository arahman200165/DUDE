import { mobileDeepLinkPath } from '../src/navigation/deep-links';

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  return mobileDeepLinkPath(path) ?? '/(tabs)';
}
