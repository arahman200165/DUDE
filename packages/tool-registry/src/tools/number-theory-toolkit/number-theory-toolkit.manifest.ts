import type { ToolMetadata } from "@dude/domain/shared/models/tool-metadata.model";
export const manifest: ToolMetadata = {
    id: 'number-theory-toolkit',
    title: 'Number Theory Toolkit',
    description: 'Modular arithmetic (including modular inverse), GCD/LCM of a list, and prime checking/factorization.',
    category: 'developer',
    keywords: [
        'modular arithmetic',
        'mod',
        'gcd',
        'lcm',
        'prime',
        'factorization',
        'factorize',
        'modular inverse',
        'number theory',
    ],
    route: '/tools/number-theory-toolkit',
    status: 'verified',
    verification: {
        propertyTested: true,
        summary: 'Fuzz-tested (fast-check): factor products reconstruct inputs with prime factors, and modular inverses satisfy their congruence.',
    },
    persistence: { input: 'session', preferences: 'local' },
    execution: { worker: 'none' },
    io: { accepts: ['text'], produces: ['text'] }
};
