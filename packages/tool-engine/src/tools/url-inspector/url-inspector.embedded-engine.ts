import { URI_COMPONENT_LEGEND, UriComponentKind, segmentUri } from "./uri-component-visualizer.js";
export const KIND_CLASSES: Record<UriComponentKind, string> = {
    scheme: 'text-cat-web-tint',
    userinfo: 'text-cat-security-tint',
    host: 'text-cat-developer-tint',
    port: 'text-cat-text-tint',
    path: 'text-cat-data-tint',
    query: 'text-cat-documents-tint',
    fragment: 'text-cat-encoding-tint',
    punctuation: 'text-text-muted',
};
export function UrlInspector_kindClass(kind: UriComponentKind): string {
    return KIND_CLASSES[kind];
}
