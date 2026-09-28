import { TOOL_DEFINITIONS } from '../registry/tool-definitions';
import { loadWorkspaceStep } from './workspace-step-loader';

/**
 * Every tool with no `<id>.workspace-step.ts` adapter, and why — mirrors
 * `core/pipeline/pipeline-coverage.spec.ts`'s "Pipeline-step adapter coverage" pattern, but for
 * workspace/history adapters. A tool landing here without a matching, deliberate reason is a
 * regression; a tool NOT landing here that has no adapter is a missing entry in this list, not a
 * passing test — see `core/workspace/AGENTS.md` and `core/history/AGENTS.md`.
 *
 * Unlike Pipeline's exclusion list, the criterion here is "is there any storage-backed content
 * worth restoring across a tab switch or a relaunch," not call-arity — multi-input and
 * network-dependent tools are NOT excluded on those grounds (see `core/history/AGENTS.md`).
 */
const DOCUMENTED_EXCLUSIONS: Readonly<Record<string, string>> = {
  // Phase 27 native network checks require explicit action; they have no workspace or pipeline adapter.
  'ping': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',
  'traceroute': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',
  'dns-lookup': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',
  'dnssec-inspector': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',
  'email-auth-inspector': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',
  'tls-inspector': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',
  'live-certificate-chain': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',
  'revocation-inspector': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',
  'ct-lookup': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',
  'starttls-inspector': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',
  'https-config-analyzer': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',
  'folder-size-analyzer': 'scan results are a live, in-session view of a folder on disk, not restorable renderer content',
  'directory-tree-generator': 'the generated tree is a live, in-session view of a folder on disk, not restorable renderer content',
  'hash-manifest': 'manifests and diffs are live results for a folder on disk; snapshots live in the desktop library, not restorable renderer content',
  'batch-operations': 'the operation journal lives in the main process, not restorable renderer content',
  'certificate-watch-list': 'the watch list is a live monitoring dashboard whose state lives in the main process, not restorable renderer content',
  'reverse-dns': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',
  'dns-propagation': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',
  'tcp-port-tester': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',
  'udp-port-tester': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',
  'port-scanner': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',
  'local-network': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',
  'public-ip': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',
  'hostname-resolver': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',
  'whois-lookup': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',
  'connectivity-tester': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',
  'latency-monitor': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',
  'packet-loss': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',
  'mtu-discovery': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',
  'route-comparison': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',
  'network-diagnostic-bundle': 'live native network checks use only in-session state; saving a selected result uses the separate explicit network history',

  // Sensitive-by-design (DUDE_PRD.md §30) — live keys/secrets/tokens/passwords, or a tool whose
  // own code already declares the relevant field 'none'-policy. Respected as-is, never overridden.
  'file-hash': 'only a local preference persisted; file content never routed through PersistenceService',
  'jwt-verify': "only local prefs; token/secret/keyMaterial/jwksUrl are deliberately bare signals",
  'jwt-signer': 'same pattern as jwt-verify',
  'hmac-generator': 'only local prefs; message/key are bare signals',
  'password-generator': 'only local prefs; generated output is a bare signal (itself a credential)',
  'password-strength-analyzer': 'only a local pref; the password itself is a bare signal',
  'aes-encrypt-decrypt': 'only local prefs; passphrase/plaintext/ciphertext are bare signals',
  'chacha20-poly1305': 'same pattern as aes-encrypt-decrypt',
  'asymmetric-key-generator': 'only local prefs; the generated key pair is a bare signal',
  'pkcs12-inspector': 'no PersistenceService usage at all — password and file bytes are bare signals',
  'jwks-viewer': "input already 'none'-policy in the tool's own code",
  'jwks-to-pem': 'same as jwks-viewer',
  'jwt-claims-analyzer': 'same as jwks-viewer',
  'jwt-expiration-visualizer': 'same as jwks-viewer',
  'pkce-generator': 'only local prefs; verifier/challenge are bare signals',
  'pkce-verifier': 'only a local pref; verifier/challenge are bare signals',
  'oauth-scope-parser': "input and extraScope already 'none'-policy",
  'oauth-token-inspector': "input already 'none'-policy",
  'oauth-playground': 'only local prefs; every OAuth flow field (clientSecret, tokens, code) is a bare signal',
  'oidc-discovery-inspector': "input already 'none'-policy",
  'basic-auth-generator': 'only a local pref; username/password/header are bare signals',
  'bearer-token-builder': "token already 'none'-policy",

  // Pure reference/lookup tools — a static table/browser with nothing to remember, only a local
  // filter-text preference at most.
  'ascii-table': 'pure reference table, nothing to remember',
  'unicode-table': 'pure reference table, nothing to remember',
  'html-entity-explorer': 'only filterText (local) persisted — pure reference/lookup table',
  'dev-snippets-reference': 'only filterText (local) persisted — pure reference table',
  'error-code-reference': 'only filterText/category (local) persisted — pure reference table',

  // No PersistenceService usage at all — input is a File/Blob/camera stream/live directory handle,
  // or a genuinely ephemeral live-clock/interactive state machine with nothing serializable.
  'directory-diff': 'no PersistenceService usage — deliberately never persists local file trees',
  'msgpack-decoder': 'binary file/blob input, no PersistenceService usage',
  'bson-viewer': 'binary file/blob input, no PersistenceService usage',
  'cbor-viewer': 'binary file/blob input, no PersistenceService usage',
  'avro-viewer': 'binary file/blob input, no PersistenceService usage',
  'parquet-viewer': 'binary file/blob input, no PersistenceService usage',
  'sqlite-viewer': 'binary file/blob input, no PersistenceService usage',
  'stopwatch-countdown': 'live-clock state machine, no meaningful input to remember',
  'image-metadata-inspector': 'no PersistenceService usage — purely File-based, ephemeral state',
  'image-cropper': 'no PersistenceService usage at all',
  'pixel-color-picker': 'no PersistenceService/signal-based state found at all',
  'file-type-detector': 'no PersistenceService usage — file-upload-only',
  'file-entropy-analyzer': 'no PersistenceService usage',
  'byte-frequency-analyzer': 'no PersistenceService usage',
  'encoding-detector': 'no PersistenceService usage',
  'bom-detector': 'no PersistenceService usage',
  'hex-diff': 'no PersistenceService usage',
  'pe-header-viewer': 'no PersistenceService usage',
  'elf-header-viewer': 'no PersistenceService usage',
  'macho-header-viewer': 'no PersistenceService usage',
  'file-inspector': 'no PersistenceService usage',
  'git-diff': 'zero PersistenceService usage — a .git folder can contain an entire private codebase',
  'qr-code-scanner': 'no PersistenceService usage at all (camera/file based)',
  'barcode-reader': 'no PersistenceService usage at all',
  'multipart-form-builder': 'no PersistenceService usage at all',

  // Only a UI preference persisted (mode/format/quality/etc.) with no content-bearing field — the
  // actual input is ephemeral (a dropped image, a live byte buffer) and was never routed through
  // PersistenceService, so there is nothing meaningful for snapshot()/restore() to round-trip.
  'exif-viewer': 'only a mode preference persisted; no content-bearing input field',
  'image-resizer': 'only mode/lock-aspect/format/quality preferences persisted; no input content',
  'image-format-converter': 'only a quality preference persisted; no input content',
  'image-compressor': 'only a quality preference persisted; no input content',
  'lockfile-inspector': 'only mode/pasteFormat/filterText (local); actual pasted content is a bare in-memory signal',
  'binary-strings-extractor': 'only min-length/include-ascii/include-utf16le preferences; actual bytes are ephemeral',
  'hex-editor': "only a bytes-per-row preference; bytes are ephemeral (interactive per-byte editor, no deterministic default edit)",
  'color-blindness-simulator': 'only a type preference persisted; the image itself is ephemeral canvas data',
  'base64-image-viewer': "only a direction preference persisted; base64Input is deliberately a bare, non-persisted signal",
  'archive-tool': 'only mode/format preferences persisted; no content-bearing input field',
};

describe('Workspace-step adapter coverage', () => {
  it('every documented exclusion actually exists as a tool', () => {
    const ids = new Set(TOOL_DEFINITIONS.map((d) => d.id));
    for (const id of Object.keys(DOCUMENTED_EXCLUSIONS)) {
      expect(ids.has(id), `"${id}" is documented as excluded but no longer exists in TOOL_DEFINITIONS`).toBe(true);
    }
  });

  it(
    'every tool either has a workspace-step adapter or a documented exclusion reason',
    async () => {
      const results = await Promise.all(
        TOOL_DEFINITIONS.map(async (definition) => ({ id: definition.id, step: await loadWorkspaceStep(definition.id) })),
      );

      const unexplainedMissing = results.filter(({ id, step }) => !step && !(id in DOCUMENTED_EXCLUSIONS)).map(({ id }) => id);
      const unexpectedlyPresent = results.filter(({ id, step }) => step && id in DOCUMENTED_EXCLUSIONS).map(({ id }) => id);

      expect(
        unexplainedMissing,
        'tools with no workspace-step adapter and no documented reason (add one to DOCUMENTED_EXCLUSIONS)',
      ).toEqual([]);
      expect(
        unexpectedlyPresent,
        'tools documented as excluded that now HAVE an adapter — remove them from DOCUMENTED_EXCLUSIONS',
      ).toEqual([]);
    },
    20000,
  );
});
