import { TOOL_DEFINITIONS } from '../registry/tool-definitions';
import { loadPipelineStep } from './pipeline-step-loader';

/**
 * Every tool with no `<id>.pipeline-step.ts` adapter, and why — mirrors `tool-count.spec.ts`'s
 * "Universal I/O contract coverage" pattern, but for pipeline-step adapters rather than `io`
 * metadata. A tool landing here without a matching, deliberate reason is a regression (an
 * intentional exclusion that silently lost its adapter, or a real migration gap); a tool NOT
 * landing here that has no adapter is a missing entry in this list, not a passing test — see
 * `core/pipeline/AGENTS.md`.
 */
const DOCUMENTED_EXCLUSIONS: Readonly<Record<string, string>> = {
  // Phase 27 native network checks require explicit action; they have no workspace or pipeline adapter.
  'ping': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'traceroute': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'dns-lookup': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'dnssec-inspector': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'email-auth-inspector': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'tls-inspector': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'live-certificate-chain': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'revocation-inspector': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'ct-lookup': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'starttls-inspector': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'https-config-analyzer': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'folder-size-analyzer': 'scanning real folders requires a user-granted native root and cleaning up requires a previewed, confirmed action; neither can run invisibly in a pipeline',
  'directory-tree-generator': 'walking real folders requires a user-granted native root and writing into them requires a previewed, confirmed action; neither can run invisibly in a pipeline',
  'hash-manifest': 'hashing real folders requires a user-granted native root and a user-directed run; it cannot execute invisibly in a pipeline',
  'duplicate-files': 'scanning real folders requires a user-granted native root and recycling duplicates requires a previewed, confirmed action; neither can run invisibly in a pipeline',
  'batch-operations': 'changing files on disk requires a previewed, explicitly confirmed native action and must never run invisibly in a pipeline',
  'certificate-watch-list': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'reverse-dns': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'dns-propagation': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'tcp-port-tester': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'udp-port-tester': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'port-scanner': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'local-network': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'public-ip': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'hostname-resolver': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'whois-lookup': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'connectivity-tester': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'latency-monitor': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'packet-loss': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'mtu-discovery': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'route-comparison': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',
  'network-diagnostic-bundle': 'native network access requires a user-directed Run action and cannot execute invisibly in a pipeline',

  // Network-required (a pipeline must never make an invisible mid-chain network call).
  'text-inspector': 'network-required (LanguageTool API)',
  'jwt-verify': 'network-required (JWKS / OIDC discovery)',
  'markdown-workspace': 'network-required (Link Checker)',
  'package-metadata-inspector': 'network-required (npm/PyPI/crates.io/NuGet registries)',

  // Multi-input: no arity concept in v1's unary `PipelineStep.run(input)` contract (a documented
  // DudeDataType/PRD vocabulary gap — diff/merge/join-shaped tools, or a document+schema pair).
  diff: 'multi-input (two documents to diff)',
  'schema-diff': 'multi-input (two schemas to diff)',
  'k8s-manifest-diff': 'multi-input (two manifests to diff)',
  'env-diff': 'multi-input (two .env files to diff)',
  'config-merge-tool': 'multi-input (two config documents to merge)',
  'advanced-diff': 'multi-input (two documents to diff)',
  'directory-diff': 'multi-input (two directory trees to diff)',
  'git-diff': 'multi-input (two revisions to diff)',
  'json-merge': 'multi-input (two JSON documents to merge)',
  'yaml-merge': 'multi-input (two YAML documents to merge)',
  'csv-join': 'multi-input (two CSV tables to join)',
  'hex-diff': 'multi-input (two binaries to diff)',
  regex: 'multi-input (pattern + independent test/replacement text)',
  'regex-benchmark': 'multi-input (pattern + one-or-more sample strings)',
  'gitignore-tester': 'multi-input (.gitignore rules + a list of paths)',
  'config-file-comparator': 'multi-input (two config files to diff)',
  'missing-env-var-detector': 'multi-input (source code + a separate .env file)',
  'string-similarity-calculator': 'multi-input (two independent strings to compare)',
  'number-base': 'multi-input in practice (no single natural base pair among 36x36 options)',
  'json-query': 'multi-input (JSON data + an independent query expression)',
  'glob-tester': 'multi-input (a glob pattern + a list of candidate paths)',
  'timezone-converter': 'multi-input (a moment + a non-empty target-zone list)',
  'date-calculator': 'multi-input (2+ independent scalar date fields)',
  'json-schema-validator': 'multi-input (an independent schema + instance document)',
  'json-patch-generate': 'multi-input (independent before/after documents to diff)',
  'json-patch-test': 'multi-input (a document + an independent patch)',
  'xml-xsd-validator': 'multi-input (an XML document + an independent XSD schema)',
  'protobuf-decoder': 'multi-input (a .proto schema + an independent binary payload)',
  'percentage-ratio-calculator': 'multi-input (2-3 numbers in distinct, non-interchangeable roles)',
  'pkce-verifier': 'multi-input (an independent code_verifier + code_challenge)',
  'aws-sigv4-inspector': 'multi-input (method/url/headers/payload/keys, no single primary field)',
  'dependency-version-comparator': 'multi-input (two independent dependency lists, no real baseline)',

  // Interactive/stateful UI with no genuine single-value input -> output transform.
  'stopwatch-countdown': 'not a transform tool (live-clock state machine over Date.now())',
  'flexbox-playground': 'not a transform tool (interactive layout builder)',
  'css-grid-playground': 'not a transform tool (interactive layout builder)',
  'hex-editor': 'not a transform tool (interactive per-byte editor, no deterministic default edit)',
  'dpi-calculator': 'multi-parameter calculator with no natural single-string encoding',

  // Sandboxed code-execution tools: the sandbox integration (Milestone 286) covers user-defined
  // pipeline *script steps*, not wiring these interactive playgrounds themselves as steps.
  'js-playground': 'sandboxed code-execution tool, not wired as a step (see user-defined scripting)',
  'html-preview': 'sandboxed code-execution tool, not wired as a step (see user-defined scripting)',
  'template-renderer': 'sandboxed code-execution tool, not wired as a step (see user-defined scripting)',
  'python-playground': 'sandboxed code-execution tool, not wired as a step (see user-defined scripting)',

  // Crypto tools needing a caller-supplied key/passphrase with no honest zero-config mode —
  // deliberately not faked with a silently hardcoded secret.
  'jwt-signer': 'needs a caller-supplied signing key with no honest zero-config mode',
  'hmac-generator': 'needs a caller-supplied key with no honest zero-config mode',
  'aes-encrypt-decrypt': 'needs a caller-supplied passphrase with no honest zero-config mode',
  'chacha20-poly1305': 'needs a caller-supplied passphrase with no honest zero-config mode',

  // No pure-logic file to adapt without a rewrite (out of scope for a mechanical migration).
  'image-compressor': 'no pure-logic file — canvas/quality logic is inline in the component',
  'barcode-reader': 'no pure-logic file — zxing decode is inline in the component',
};

describe('Pipeline-step adapter coverage', () => {
  it('every documented exclusion actually exists as a tool', () => {
    const ids = new Set(TOOL_DEFINITIONS.map((d) => d.id));
    for (const id of Object.keys(DOCUMENTED_EXCLUSIONS)) {
      expect(ids.has(id), `"${id}" is documented as excluded but no longer exists in TOOL_DEFINITIONS`).toBe(true);
    }
  });

  it(
    'every tool either has a pipeline-step adapter or a documented exclusion reason',
    async () => {
      const results = await Promise.all(
        TOOL_DEFINITIONS.map(async (definition) => ({ id: definition.id, step: await loadPipelineStep(definition.id) })),
      );

      const unexplainedMissing = results.filter(({ id, step }) => !step && !(id in DOCUMENTED_EXCLUSIONS)).map(({ id }) => id);
      const unexpectedlyPresent = results.filter(({ id, step }) => step && id in DOCUMENTED_EXCLUSIONS).map(({ id }) => id);

      expect(
        unexplainedMissing,
        'tools with no pipeline-step adapter and no documented reason (add one to DOCUMENTED_EXCLUSIONS)',
      ).toEqual([]);
      expect(
        unexpectedlyPresent,
        'tools documented as excluded that now HAVE an adapter — remove them from DOCUMENTED_EXCLUSIONS',
      ).toEqual([]);
    },
    30000,
  );
});
