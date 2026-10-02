import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'process-diagnostic-bundle',
    title: 'Process Diagnostic Bundle',
    description: 'Collect everything about one running Windows process into a single ZIP for a bug report or support case: summary, process tree, command line, environment, modules with versions and signers, threads, handles, ports, related Event Log entries, CPU and memory samples and a minidump. Every section shows its fields and size first and can be switched off.',
    category: 'developer',
    keywords: ['diagnostic bundle', 'process dump', 'minidump', 'support bundle', 'zip', 'process report', 'crash dump', 'troubleshooting', 'process', 'windows', 'pid', 'full memory dump', 'event log', 'modules', 'environment'],
    route: '/tools/process-diagnostic-bundle',
    status: 'experimental',
    persistence: { input: 'none', preferences: 'local' },
    capabilities: [
        { kind: 'platform', id: 'native-system', web: 'unavailable', note: 'reads the process, its Event Log entries and a minidump through the desktop system helper, then writes the ZIP from the main process' },
        { kind: 'platform', id: 'native-fs', web: 'unavailable', note: 'the native save dialog grants the one ZIP file the bundle is written to' },
    ],
    consequenceClass: ['process-management'],
    verification: {
        crossChecked: [
            'a spawned node process with a marked environment variable and a listening TCP socket, exported through the real windows-sys.exe helper: cmdline.txt and env.json matched the child, ports.json listed the LISTEN socket, and process.dmp began with the MDMP signature',
            'the ZIP was read back with fflate unzipSync: every section that ran had its entry and manifest.json listed each section status',
        ],
        propertyTested: false,
        vectors: ['handles were skipped (not elevated) and full-memory dumps were not exercised against a large process; both are covered by unit tests against a mocked helper only'],
        summary: 'Collection, the streamed minidump and the ZIP were verified end to end against a real spawned process and the real helper. Save-grant, identity-mismatch, cancel and staging-cleanup behaviour is unit tested in apps/desktop/sys-bundle.spec.ts.',
    },
    io: { accepts: ['text'], produces: ['file'] }
};
