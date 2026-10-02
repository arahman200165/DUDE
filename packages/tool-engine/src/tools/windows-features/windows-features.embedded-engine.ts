import type { WindowsCapability, WindowsFeature } from "@dude/contracts/system/feature-types";
export function WindowsFeaturesTool_stateLabel(state: WindowsFeature['state'] | WindowsCapability['state']): string {
    return state.replaceAll('-', ' ');
}
export function WindowsFeaturesTool_featureCanChange(feature: WindowsFeature): boolean { return feature.state === 'enabled' || feature.state === 'disabled'; }
export function WindowsFeaturesTool_messageFor(caught: unknown): string { return caught instanceof Error ? caught.message : String(caught); }
