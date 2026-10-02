import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'csr-generator-inspector',
    title: 'CSR Generator & Inspector',
    shortTitle: 'CSR Tools',
    description: 'Generates an RSA CSR (PKCS#10) signed with a pasted private key, or inspects an existing CSR.',
    category: 'security',
    keywords: ['csr', 'certificate signing request', 'pkcs10', 'pkcs#10', 'x.509', 'rsa', 'subject'],
    route: '/tools/csr-generator-inspector',
    status: 'verified',
    verification: {
        crossChecked: ['openssl req -newkey rsa:2048 / openssl req -noout -text'],
        summary: "Parses a real openssl-generated CSR, correctly extracting subject/key-size/signature validity that openssl req -text independently confirms.",
    },
    consequenceClass: ['crypto'],
    persistence: { input: 'none', preferences: 'local' },
    io: { accepts: ['text'], produces: ['text', 'json'] }
};
