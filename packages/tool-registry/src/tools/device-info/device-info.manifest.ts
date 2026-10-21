import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'device-info',
    title: 'Device Info',
    description: 'Read-only report of this device and runtime: browser, display, locale, hardware and, in the desktop app, operating system facts.',
    category: 'developer',
    keywords: ['device', 'screen', 'user agent', 'timezone', 'locale', 'dpr', 'platform', 'os', 'hardware', 'resolution', 'system info'],
    route: '/tools/device-info',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'none' },
    io: { accepts: ['json'], produces: ['text', 'json'] },
    capabilities: [
        { kind: 'platform', id: 'native-system', web: 'fallback', note: 'adds operating system, CPU and memory facts in Desktop DUDE; the web companion reports browser facts only' },
    ],
};
