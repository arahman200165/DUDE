# Security & Capability Disclosure

Generated from `src/app/tools/**/<id>.manifest.ts` metadata by `scripts/generate-security-doc.mjs`
(DUDE_PRD.md §21 Phase 23 Items 7 & 13) — do not hand-edit the tables below; edit the source
manifests and run `npm run generate:registry`.

Every tool in DUDE runs its transform entirely client-side unless a table below says otherwise.
"Verified" status and its cross-check/vector summary are defined in `ADDING_A_TOOL.md`'s
"Status & confidence tiers" section — a summary here is what was actually tested, not a
certification claim.

## High-Consequence Tool Matrix

Tools whose function is cryptography, authentication material, arbitrary code execution, or
secret handling — the categories DUDE_PRD.md §21 Phase 23 calls out as needing a stronger bar
than "the UI appears to work". Categories reserved for capabilities DUDE does not ship yet
(filesystem-write, process-management, registry, network-scanning, database-write) have no rows
below until a Phase 27+ tool actually claims them.

| Tool | Consequence class | Status |
| --- | --- | --- |
| [AES Encrypt / Decrypt](https://arahman200165.github.io/DUDE/tools/aes-encrypt-decrypt) | Crypto | stable |
| [Asymmetric Key Generator](https://arahman200165.github.io/DUDE/tools/asymmetric-key-generator) | Crypto | stable |
| [AWS Signature V4 Inspector](https://arahman200165.github.io/DUDE/tools/aws-sigv4-inspector) | Authentication | stable |
| [Basic Auth Header Generator](https://arahman200165.github.io/DUDE/tools/basic-auth-generator) | Authentication | stable |
| [Bearer Token Builder](https://arahman200165.github.io/DUDE/tools/bearer-token-builder) | Authentication | stable |
| [Certificate Chain Viewer & Builder](https://arahman200165.github.io/DUDE/tools/certificate-chain-tools) | Crypto | stable |
| [ChaCha20-Poly1305 Encrypt / Decrypt](https://arahman200165.github.io/DUDE/tools/chacha20-poly1305) | Crypto | stable |
| [CSR Generator & Inspector](https://arahman200165.github.io/DUDE/tools/csr-generator-inspector) | Crypto | stable |
| [Hash Generator](https://arahman200165.github.io/DUDE/tools/hash) | Crypto | stable |
| [HMAC Generator](https://arahman200165.github.io/DUDE/tools/hmac-generator) | Crypto | stable |
| [HTML Preview](https://arahman200165.github.io/DUDE/tools/html-preview) | Code Execution | experimental |
| [HTTP Digest Auth Helper](https://arahman200165.github.io/DUDE/tools/http-digest-auth-helper) | Authentication | stable |
| [JavaScript Playground](https://arahman200165.github.io/DUDE/tools/js-playground) | Code Execution | experimental |
| [JWKS → Public Keys](https://arahman200165.github.io/DUDE/tools/jwks-to-pem) | Crypto | stable |
| [JWKS Viewer](https://arahman200165.github.io/DUDE/tools/jwks-viewer) | Authentication | stable |
| [JWT Debugger](https://arahman200165.github.io/DUDE/tools/jwt) | Authentication | stable |
| [JWT Claims Analyzer](https://arahman200165.github.io/DUDE/tools/jwt-claims-analyzer) | Authentication | stable |
| [JWT Expiration Visualizer](https://arahman200165.github.io/DUDE/tools/jwt-expiration-visualizer) | Authentication | stable |
| [JWT Signer](https://arahman200165.github.io/DUDE/tools/jwt-signer) | Authentication | experimental |
| [JWT Signature Verifier](https://arahman200165.github.io/DUDE/tools/jwt-verify) | Authentication | experimental |
| [Kubernetes Base64 Secret Encoder / Decoder](https://arahman200165.github.io/DUDE/tools/k8s-secret-base64) | Secret Management | stable |
| [kubeconfig Inspector](https://arahman200165.github.io/DUDE/tools/kubeconfig-inspector) | Authentication | stable |
| [OAuth 2.0 Playground](https://arahman200165.github.io/DUDE/tools/oauth-playground) | Authentication | stable |
| [OAuth Scope Parser](https://arahman200165.github.io/DUDE/tools/oauth-scope-parser) | Authentication | stable |
| [OAuth Token Inspector](https://arahman200165.github.io/DUDE/tools/oauth-token-inspector) | Authentication | stable |
| [OpenID Connect Discovery Document Inspector](https://arahman200165.github.io/DUDE/tools/oidc-discovery-inspector) | Authentication | stable |
| [PEM / DER Inspector & Converter](https://arahman200165.github.io/DUDE/tools/pem-der-inspector) | Crypto | stable |
| [PKCE Generator](https://arahman200165.github.io/DUDE/tools/pkce-generator) | Authentication | stable |
| [PKCE Verifier](https://arahman200165.github.io/DUDE/tools/pkce-verifier) | Authentication | stable |
| [PKCS#12 / PFX Inspector](https://arahman200165.github.io/DUDE/tools/pkcs12-inspector) | Crypto | stable |
| [Python Playground](https://arahman200165.github.io/DUDE/tools/python-playground) | Code Execution | experimental |
| [Secret Detector](https://arahman200165.github.io/DUDE/tools/secret-detector) | Secret Management | stable |
| [SSH Key Generator & Inspector](https://arahman200165.github.io/DUDE/tools/ssh-key-tools) | Crypto | stable |
| [Template Renderer](https://arahman200165.github.io/DUDE/tools/template-renderer) | Code Execution | experimental |
| [X.509 Certificate Inspector](https://arahman200165.github.io/DUDE/tools/x509-certificate-inspector) | Crypto | stable |

## Network-Capable Tools

Every other tool processes data entirely locally and makes no network request.

| Tool | What it contacts |
| --- | --- |
| [JWT Signature Verifier](https://arahman200165.github.io/DUDE/tools/jwt-verify) | JWKS / OIDC discovery |
| [Advanced Markdown Workspace](https://arahman200165.github.io/DUDE/tools/markdown-workspace) | Link Checker: HEAD/GET per link, manual "Check links" button only |
| [Package Metadata Inspector](https://arahman200165.github.io/DUDE/tools/package-metadata-inspector) | npm / PyPI / crates.io / NuGet registries |
| [Text Inspector](https://arahman200165.github.io/DUDE/tools/text-inspector) | LanguageTool API |

## Native/Desktop-Privileged Tools

Tools that use a desktop-only native capability (Electron file/folder picker, or OS-keychain-backed
storage) beyond the browser sandbox. All other tools run identically on the web companion and the
desktop app.

| Tool | Native capability |
| --- | --- |
| [CSS Formatter / Minifier](https://arahman200165.github.io/DUDE/tools/css-formatter) | Desktop file/folder open |
| [CSV Viewer / Converter](https://arahman200165.github.io/DUDE/tools/csv-viewer) | Desktop file/folder open |
| [Directory Diff](https://arahman200165.github.io/DUDE/tools/directory-diff) | Desktop file/folder open |
| [HTML Preview](https://arahman200165.github.io/DUDE/tools/html-preview) | Desktop file/folder open |
| [INI Formatter / Parser](https://arahman200165.github.io/DUDE/tools/ini-formatter) | Desktop file/folder open |
| [JavaScript Playground](https://arahman200165.github.io/DUDE/tools/js-playground) | Desktop file/folder open |
| [JSON Formatter](https://arahman200165.github.io/DUDE/tools/json) | Desktop file/folder open |
| [Advanced Markdown Workspace](https://arahman200165.github.io/DUDE/tools/markdown-workspace) | Desktop file/folder open |
| [SQL Formatter / Minifier](https://arahman200165.github.io/DUDE/tools/sql-formatter-tool) | Desktop file/folder open |
| [Text Inspector](https://arahman200165.github.io/DUDE/tools/text-inspector) | Desktop file/folder open |
| [TOML Formatter / Validator](https://arahman200165.github.io/DUDE/tools/toml-formatter) | Desktop file/folder open |
| [XML Formatter](https://arahman200165.github.io/DUDE/tools/xml-formatter) | Desktop file/folder open |
| [YAML ↔ JSON Converter](https://arahman200165.github.io/DUDE/tools/yaml-json) | Desktop file/folder open |
