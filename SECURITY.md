# Security & Capability Disclosure

Generated from `src/app/tools/**/<id>.manifest.ts` metadata by `scripts/generate-security-doc.mjs`
(DUDE_PRD.md §21 Phase 23 Items 7 & 13) — do not hand-edit the tables below; edit the source
manifests and run `npm run generate:registry`.

Every tool in DUDE runs its transform entirely client-side unless a table below says otherwise.
"Verified" status and its cross-check/vector summary are defined in `ADDING_A_TOOL.md`'s
"Status & confidence tiers" section — a summary here is what was actually tested, not a
certification claim.

## High-Consequence Tool Matrix

Tools whose function is cryptography, authentication material, arbitrary code execution, secret
handling, or network scanning — the categories DUDE_PRD.md §21 Phase 23 calls out as needing a
stronger bar than "the UI appears to work" — plus HTTP requests that can change server state
(`remote-write`, added in Phase 27) and changes to local files (`filesystem-write`, added in
Phase 29 — always through the preview → confirm → journal/undo mutation engine).
Categories reserved for capabilities DUDE does not ship yet (registry, system-config,
database-write) have no rows below until a tool claims them.

| Tool | Consequence class | Status |
| --- | --- | --- |
| [AES Encrypt / Decrypt](https://arahman200165.github.io/DUDE/tools/aes-encrypt-decrypt) | Crypto | verified — Decrypts AES-256-GCM/CBC ciphertext built independently by Node's OpenSSL-backed crypto module, not just its own round-trip. |
| [Asymmetric Key Generator](https://arahman200165.github.io/DUDE/tools/asymmetric-key-generator) | Crypto | verified — A generated RSA-2048 private key was independently loaded, signed, and verified by openssl, confirming standards-compliant PKCS#8 output. |
| [AWS Signature V4 Inspector](https://arahman200165.github.io/DUDE/tools/aws-sigv4-inspector) | Authentication | verified — Signature computation matches AWS's own documented worked example exactly, cross-checked independently via Node's crypto. |
| [Basic Auth Header Generator](https://arahman200165.github.io/DUDE/tools/basic-auth-generator) | Authentication | verified — decodeBasicAuthHeader(buildBasicAuthHeader(u, p)) recovers u/p exactly for any generated colon-free username and arbitrary password (fast-check property test). |
| [Batch Operations](https://arahman200165.github.io/DUDE/tools/batch-operations) | Filesystem Write | experimental |
| [Batch Rename](https://arahman200165.github.io/DUDE/tools/batch-rename) | Filesystem Write | experimental |
| [Batch Text Converter](https://arahman200165.github.io/DUDE/tools/batch-text-converter) | Filesystem Write | experimental |
| [Bearer Token Builder](https://arahman200165.github.io/DUDE/tools/bearer-token-builder) | Authentication | verified — Fuzz- and crosscheck-tested (fast-check) against an independently-written RFC 6750 §2.1 b64token grammar regex. |
| [Certificate Chain Viewer & Builder](https://arahman200165.github.io/DUDE/tools/certificate-chain-tools) | Crypto | verified — Chain validity for a real openssl-built leaf/intermediate/root chain matches openssl verify. |
| [ChaCha20-Poly1305 Encrypt / Decrypt](https://arahman200165.github.io/DUDE/tools/chacha20-poly1305) | Crypto | verified — Decrypts ChaCha20-Poly1305 ciphertext built independently by Node's OpenSSL-backed crypto module, not just @noble/ciphers agreeing with itself. |
| [TCP/HTTP Connectivity Tester](https://arahman200165.github.io/DUDE/tools/connectivity-tester) | Remote Write | experimental |
| [CSR Generator & Inspector](https://arahman200165.github.io/DUDE/tools/csr-generator-inspector) | Crypto | verified — Parses a real openssl-generated CSR, correctly extracting subject/key-size/signature validity that openssl req -text independently confirms. |
| [Directory Tree Generator](https://arahman200165.github.io/DUDE/tools/directory-tree-generator) | Filesystem Write | experimental |
| [Duplicate Files](https://arahman200165.github.io/DUDE/tools/duplicate-files) | Filesystem Write | experimental |
| [File Split & Join](https://arahman200165.github.io/DUDE/tools/file-split-join) | Filesystem Write | experimental |
| [Folder Size Analyzer](https://arahman200165.github.io/DUDE/tools/folder-size-analyzer) | Filesystem Write | experimental |
| [Hash Generator](https://arahman200165.github.io/DUDE/tools/hash) | Crypto | verified — Every one of the 15 supported algorithms is tested against its official published test vector, not just self round-trip. |
| [HMAC Generator](https://arahman200165.github.io/DUDE/tools/hmac-generator) | Crypto | verified — HMAC-SHA1/256/384/512 match RFC 4231's official test vectors exactly. |
| [HTML Preview](https://arahman200165.github.io/DUDE/tools/html-preview) | Code Execution | verified — Property-tested (fast-check) for core output shape and invariants. |
| [HTTP Digest Auth Helper](https://arahman200165.github.io/DUDE/tools/http-digest-auth-helper) | Authentication | verified — HA1/HA2/response computation matches RFC 2617's official worked example exactly. |
| [HTTPS Configuration Analyzer](https://arahman200165.github.io/DUDE/tools/https-config-analyzer) | Network Scanning | experimental |
| [JavaScript Playground](https://arahman200165.github.io/DUDE/tools/js-playground) | Code Execution | verified — Property-tested (fast-check) for core output shape and invariants. |
| [JWKS → Public Keys](https://arahman200165.github.io/DUDE/tools/jwks-to-pem) | Crypto | verified — A JWK generated by Node's crypto module (not jose) converts to a PEM that Node's own createPublicKey re-imports to an identical modulus/exponent. |
| [JWKS Viewer](https://arahman200165.github.io/DUDE/tools/jwks-viewer) | Authentication | verified — Fuzz-tested with arbitrary text and arbitrary "keys" array entries (fast-check) -- never rejects/throws. |
| [JWT Debugger](https://arahman200165.github.io/DUDE/tools/jwt) | Authentication | verified — Fuzz-tested with arbitrary text and arbitrary three-segment tokens (fast-check) -- never throws on malformed input. |
| [JWT Claims Analyzer](https://arahman200165.github.io/DUDE/tools/jwt-claims-analyzer) | Authentication | verified — Fuzz-tested with arbitrary JSON-shaped header/payload (fast-check) -- caught and fixed a real crash on non-object header/payload input. |
| [JWT Expiration Visualizer](https://arahman200165.github.io/DUDE/tools/jwt-expiration-visualizer) | Authentication | verified — Fuzz-tested with arbitrary JSON-shaped payloads and arbitrary numeric iat/nbf/exp values (fast-check) -- never throws. |
| [JWT Signer](https://arahman200165.github.io/DUDE/tools/jwt-signer) | Authentication | verified — HS256 signature output matches a byte-for-byte independent recomputation with Node's crypto.createHmac. |
| [JWT Signature Verifier](https://arahman200165.github.io/DUDE/tools/jwt-verify) | Authentication | verified — Verifies a token signed by hand with Node's HMAC-SHA256, and rejects it when a single signature byte is flipped — not just a token jose signed and jose verified. |
| [Kubernetes Base64 Secret Encoder / Decoder](https://arahman200165.github.io/DUDE/tools/k8s-secret-base64) | Secret Management | verified — decodeSecretData(encodeSecretData(pairs)) recovers every value exactly for generated key/value arrays (fast-check property test), built on the already-verified base64 codec. |
| [kubeconfig Inspector](https://arahman200165.github.io/DUDE/tools/kubeconfig-inspector) | Authentication | verified — Fuzz-tested with arbitrary text (fast-check) -- never throws on malformed YAML. |
| [Network Diagnostic Bundle Export](https://arahman200165.github.io/DUDE/tools/network-diagnostic-bundle) | Network Scanning | experimental |
| [OAuth 2.0 Playground](https://arahman200165.github.io/DUDE/tools/oauth-playground) | Authentication | verified — Callback URL/device-response/token-response inspection is fuzz-tested with arbitrary text (fast-check) -- never throws. |
| [OAuth Scope Parser](https://arahman200165.github.io/DUDE/tools/oauth-scope-parser) | Authentication | verified — parseScopeString/buildScopeString round-trip and never-throws are checked with generated inputs (fast-check), not just hand-picked examples. |
| [OAuth Token Inspector](https://arahman200165.github.io/DUDE/tools/oauth-token-inspector) | Authentication | verified — Fuzz-tested with arbitrary text (fast-check) -- never throws; delegates JWT decoding to the already-verified JWT Debugger. |
| [OpenID Connect Discovery Document Inspector](https://arahman200165.github.io/DUDE/tools/oidc-discovery-inspector) | Authentication | verified — Checks against the official OIDC Discovery 1.0 field list and is fuzz-tested with arbitrary text/JSON (fast-check) -- never throws. |
| [PEM / DER Inspector & Converter](https://arahman200165.github.io/DUDE/tools/pem-der-inspector) | Crypto | verified — Parses the checked-in ISRG Root X1 certificate as PEM and DER with matching bytes and ASN.1 structure, cross-checked by Node X509Certificate; also checks Node-crypto-generated RSA/EC/Ed25519 PEM keys and fast-check fuzzing. |
| [PKCE Generator](https://arahman200165.github.io/DUDE/tools/pkce-generator) | Authentication | verified — S256 code_challenge computation matches RFC 7636 Appendix B's official worked example exactly. |
| [PKCE Verifier](https://arahman200165.github.io/DUDE/tools/pkce-verifier) | Authentication | verified — Verifier/challenge matching is checked against RFC 7636 Appendix B's official worked example. |
| [PKCS#12 / PFX Inspector](https://arahman200165.github.io/DUDE/tools/pkcs12-inspector) | Crypto | verified — Correctly extracts leaf/intermediate certs and friendlyName from a real openssl-generated .p12 using modern PBES2 encryption. |
| [Port Scanner](https://arahman200165.github.io/DUDE/tools/port-scanner) | Network Scanning | experimental |
| [Python Playground](https://arahman200165.github.io/DUDE/tools/python-playground) | Code Execution | verified — Fuzz-tested the pure sandbox-event reducer for transcript and outcome shape. |
| [Secret Detector](https://arahman200165.github.io/DUDE/tools/secret-detector) | Secret Management | verified — Fuzz-tested with generated text up to 5000 chars, asserting it never throws and never takes more than 500ms -- guards against regex catastrophic backtracking. |
| [SSH Key Generator & Inspector](https://arahman200165.github.io/DUDE/tools/ssh-key-tools) | Crypto | verified — SHA256/MD5 fingerprints for Ed25519/RSA-2048/ECDSA-P256 keys matched byte-for-byte against real ssh-keygen output. |
| [System Changes](https://arahman200165.github.io/DUDE/tools/system-changes) | Process Management | experimental |
| [System Changes](https://arahman200165.github.io/DUDE/tools/system-changes) | Registry | experimental |
| [System Changes](https://arahman200165.github.io/DUDE/tools/system-changes) | System Configuration | experimental |
| [Template Renderer](https://arahman200165.github.io/DUDE/tools/template-renderer) | Code Execution | verified — Fuzz-tested arbitrary template/context handling and valid JSON context embedding. |
| [TLS Connection Inspector](https://arahman200165.github.io/DUDE/tools/tls-inspector) | Secret Management | experimental |
| [TLS Connection Inspector](https://arahman200165.github.io/DUDE/tools/tls-inspector) | Authentication | experimental |
| [TLS Connection Inspector](https://arahman200165.github.io/DUDE/tools/tls-inspector) | Process Management | experimental |
| [Tree Search](https://arahman200165.github.io/DUDE/tools/tree-search) | Filesystem Write | experimental |
| [X.509 Certificate Inspector](https://arahman200165.github.io/DUDE/tools/x509-certificate-inspector) | Crypto | verified — SHA-1/SHA-256 fingerprints for a real openssl-generated certificate matched exactly. |

## Network-Capable Tools

Every other tool processes data entirely locally and makes no network request.

| Tool | What it contacts |
| --- | --- |
| [Certificate Watch List](https://arahman200165.github.io/DUDE/tools/certificate-watch-list) | each watched host:port (one TLS handshake per check, on the schedule you set, while DUDE is running) |
| [TCP/HTTP Connectivity Tester](https://arahman200165.github.io/DUDE/tools/connectivity-tester) | a TCP connection or HTTP(S) request to the target you enter |
| [Certificate Transparency Lookup](https://arahman200165.github.io/DUDE/tools/ct-lookup) | crt.sh (or a crt.sh-compatible endpoint you enter) for domain history; SCT decoding is local |
| [DNS Lookup](https://arahman200165.github.io/DUDE/tools/dns-lookup) | your system DNS servers, or a DNS, DoH, or DoT server you choose; CAA checks also query the parent names |
| [DNS Propagation Tester](https://arahman200165.github.io/DUDE/tools/dns-propagation) | Cloudflare (1.1.1.1), Google (8.8.8.8), Quad9 (9.9.9.9), your system DNS servers, and any custom resolvers you add |
| [DNSSEC Inspector](https://arahman200165.github.io/DUDE/tools/dnssec-inspector) | your system DNS servers, or a DNS, DoH, or DoT server you choose — queried for each zone from the root down (DS, DNSKEY, NS) |
| [Email Auth Inspector](https://arahman200165.github.io/DUDE/tools/email-auth-inspector) | your system DNS servers, or a DNS, DoH, or DoT server you choose — TXT/A/AAAA/MX lookups only; pasted headers stay on this machine |
| [Hostname Resolver](https://arahman200165.github.io/DUDE/tools/hostname-resolver) | the resolver configured in Windows |
| [HTTPS Configuration Analyzer](https://arahman200165.github.io/DUDE/tools/https-config-analyzer) | the host you enter: a TLS enumeration and handshake, http:// and https:// HEAD requests, and DNS lookups (CAA, HTTPS/SVCB) |
| [JWT Signature Verifier](https://arahman200165.github.io/DUDE/tools/jwt-verify) | JWKS / OIDC discovery |
| [Continuous Ping / Latency Graph](https://arahman200165.github.io/DUDE/tools/latency-monitor) | ICMP echo requests to the host you enter, for at most one hour |
| [Live Certificate Chain Fetcher](https://arahman200165.github.io/DUDE/tools/live-certificate-chain) | the host and port you enter (one TLS handshake to fetch the presented chain, with the SNI you choose) |
| [Advanced Markdown Workspace](https://arahman200165.github.io/DUDE/tools/markdown-workspace) | Link Checker: HEAD/GET per link, manual "Check links" button only |
| [MTU Discovery](https://arahman200165.github.io/DUDE/tools/mtu-discovery) | sized ICMP echo probes to the host you enter |
| [Network Diagnostic Bundle Export](https://arahman200165.github.io/DUDE/tools/network-diagnostic-bundle) | only the selected checks, against the one target you enter |
| [Package Metadata Inspector](https://arahman200165.github.io/DUDE/tools/package-metadata-inspector) | npm / PyPI / crates.io / NuGet registries |
| [Packet-Loss Measurement](https://arahman200165.github.io/DUDE/tools/packet-loss) | ICMP echo requests to the host you enter, at most 100 per run |
| [Ping](https://arahman200165.github.io/DUDE/tools/ping) | ICMP echo requests to the host you enter |
| [Port Scanner](https://arahman200165.github.io/DUDE/tools/port-scanner) | TCP/UDP probes to the reviewed hosts and ports, at most 1,024 per scan |
| [Public IP Detector](https://arahman200165.github.io/DUDE/tools/public-ip) | api.ipify.org (IPv4) and api6.ipify.org (IPv6) |
| [Reverse DNS Lookup](https://arahman200165.github.io/DUDE/tools/reverse-dns) | PTR query to the system resolver, or a DNS, DoH, or DoT server you choose |
| [Certificate Revocation Inspector](https://arahman200165.github.io/DUDE/tools/revocation-inspector) | the OCSP, CRL, and AIA URLs named inside the certificate (HTTP); optionally one TLS handshake to fetch the chain first |
| [Route Comparison](https://arahman200165.github.io/DUDE/tools/route-comparison) | hop-limited ICMP probes to the one or two hosts you enter |
| [STARTTLS Inspector](https://arahman200165.github.io/DUDE/tools/starttls-inspector) | the host and port you enter (a plaintext protocol negotiation, then a TLS handshake) |
| [TCP Port Tester](https://arahman200165.github.io/DUDE/tools/tcp-port-tester) | a TCP connection to the host and port you enter |
| [Text Inspector](https://arahman200165.github.io/DUDE/tools/text-inspector) | LanguageTool API |
| [TLS Connection Inspector](https://arahman200165.github.io/DUDE/tools/tls-inspector) | the host and port you enter (a live TLS handshake with the SNI you choose); the HTTP/3 tab reaches the same host over QUIC via the Chromium network stack |
| [Traceroute](https://arahman200165.github.io/DUDE/tools/traceroute) | hop-limited ICMP probes to the host you enter |
| [UDP Port Tester](https://arahman200165.github.io/DUDE/tools/udp-port-tester) | a UDP datagram to the host and port you enter |
| [WHOIS Lookup](https://arahman200165.github.io/DUDE/tools/whois-lookup) | IANA RDAP bootstrap and the RDAP server it names, or WHOIS over TCP 43 (whois.iana.org and its referral, or a custom server) |

## Native/Desktop-Privileged Tools

Tools that use a desktop-only native capability (Electron file/folder picker, native filesystem
access, the local LLM proxy, the collaboration server, or OS-keychain-backed storage) beyond the
browser sandbox.

| Tool | Native capability |
| --- | --- |
| [Batch Operations](https://arahman200165.github.io/DUDE/tools/batch-operations) | Native filesystem write |
| [Batch Rename](https://arahman200165.github.io/DUDE/tools/batch-rename) | Native filesystem access; Native filesystem write |
| [Batch Text Converter](https://arahman200165.github.io/DUDE/tools/batch-text-converter) | Native filesystem access; Native filesystem write |
| [Certificate Watch List](https://arahman200165.github.io/DUDE/tools/certificate-watch-list) | Native network diagnostics |
| [TCP/HTTP Connectivity Tester](https://arahman200165.github.io/DUDE/tools/connectivity-tester) | Native network diagnostics |
| [CSS Formatter / Minifier](https://arahman200165.github.io/DUDE/tools/css-formatter) | Desktop file/folder open |
| [CSV Viewer / Converter](https://arahman200165.github.io/DUDE/tools/csv-viewer) | Desktop file/folder open |
| [Certificate Transparency Lookup](https://arahman200165.github.io/DUDE/tools/ct-lookup) | Native network diagnostics |
| [Directory Diff](https://arahman200165.github.io/DUDE/tools/directory-diff) | Desktop file/folder open; Native filesystem access; File watching |
| [Directory Tree Generator](https://arahman200165.github.io/DUDE/tools/directory-tree-generator) | Native filesystem access; Native filesystem write |
| [DNS Lookup](https://arahman200165.github.io/DUDE/tools/dns-lookup) | Native network diagnostics |
| [DNS Propagation Tester](https://arahman200165.github.io/DUDE/tools/dns-propagation) | Native network diagnostics |
| [DNSSEC Inspector](https://arahman200165.github.io/DUDE/tools/dnssec-inspector) | Native network diagnostics |
| [Duplicate Files](https://arahman200165.github.io/DUDE/tools/duplicate-files) | Native filesystem access; Native filesystem write |
| [Email Auth Inspector](https://arahman200165.github.io/DUDE/tools/email-auth-inspector) | Native network diagnostics |
| [File Split & Join](https://arahman200165.github.io/DUDE/tools/file-split-join) | Native filesystem access; Native filesystem write |
| [Folder Size Analyzer](https://arahman200165.github.io/DUDE/tools/folder-size-analyzer) | Native filesystem access; Native filesystem write |
| [Git Repo Browser](https://arahman200165.github.io/DUDE/tools/git-diff) | Native filesystem access; File watching |
| [Hash Manifest & Snapshot](https://arahman200165.github.io/DUDE/tools/hash-manifest) | Native filesystem access |
| [Hostname Resolver](https://arahman200165.github.io/DUDE/tools/hostname-resolver) | Native network diagnostics |
| [HTML Preview](https://arahman200165.github.io/DUDE/tools/html-preview) | Desktop file/folder open |
| [HTTPS Configuration Analyzer](https://arahman200165.github.io/DUDE/tools/https-config-analyzer) | Native network diagnostics |
| [INI Formatter / Parser](https://arahman200165.github.io/DUDE/tools/ini-formatter) | Desktop file/folder open |
| [JavaScript Playground](https://arahman200165.github.io/DUDE/tools/js-playground) | Desktop file/folder open |
| [JSON Formatter](https://arahman200165.github.io/DUDE/tools/json) | Desktop file/folder open |
| [Large-File Streaming Inspector](https://arahman200165.github.io/DUDE/tools/large-file-inspector) | Native filesystem access; File watching |
| [Continuous Ping / Latency Graph](https://arahman200165.github.io/DUDE/tools/latency-monitor) | Native network diagnostics |
| [Live Certificate Chain Fetcher](https://arahman200165.github.io/DUDE/tools/live-certificate-chain) | Native network diagnostics |
| [Local Network Viewer](https://arahman200165.github.io/DUDE/tools/local-network) | Native network diagnostics |
| [Advanced Markdown Workspace](https://arahman200165.github.io/DUDE/tools/markdown-workspace) | Desktop file/folder open; Collaboration relay |
| [MTU Discovery](https://arahman200165.github.io/DUDE/tools/mtu-discovery) | Native network diagnostics |
| [Network Diagnostic Bundle Export](https://arahman200165.github.io/DUDE/tools/network-diagnostic-bundle) | Native network diagnostics |
| [Packet-Loss Measurement](https://arahman200165.github.io/DUDE/tools/packet-loss) | Native network diagnostics |
| [Ping](https://arahman200165.github.io/DUDE/tools/ping) | Native network diagnostics |
| [Port Scanner](https://arahman200165.github.io/DUDE/tools/port-scanner) | Native network diagnostics |
| [Public IP Detector](https://arahman200165.github.io/DUDE/tools/public-ip) | Native network diagnostics |
| [Regex Tester](https://arahman200165.github.io/DUDE/tools/regex) | Local LLM proxy |
| [Reverse DNS Lookup](https://arahman200165.github.io/DUDE/tools/reverse-dns) | Native network diagnostics |
| [Certificate Revocation Inspector](https://arahman200165.github.io/DUDE/tools/revocation-inspector) | Native network diagnostics |
| [Route Comparison](https://arahman200165.github.io/DUDE/tools/route-comparison) | Native network diagnostics |
| [SQL Formatter / Minifier](https://arahman200165.github.io/DUDE/tools/sql-formatter-tool) | Desktop file/folder open |
| [STARTTLS Inspector](https://arahman200165.github.io/DUDE/tools/starttls-inspector) | Native network diagnostics |
| [System Changes](https://arahman200165.github.io/DUDE/tools/system-changes) | Native Windows system changes; Native Windows system access |
| [TCP Port Tester](https://arahman200165.github.io/DUDE/tools/tcp-port-tester) | Native network diagnostics |
| [Text Inspector](https://arahman200165.github.io/DUDE/tools/text-inspector) | Desktop file/folder open |
| [TLS Connection Inspector](https://arahman200165.github.io/DUDE/tools/tls-inspector) | Native network diagnostics |
| [TOML Formatter / Validator](https://arahman200165.github.io/DUDE/tools/toml-formatter) | Desktop file/folder open |
| [Traceroute](https://arahman200165.github.io/DUDE/tools/traceroute) | Native network diagnostics |
| [Tree Search](https://arahman200165.github.io/DUDE/tools/tree-search) | Native filesystem access; Native filesystem write |
| [UDP Port Tester](https://arahman200165.github.io/DUDE/tools/udp-port-tester) | Native network diagnostics |
| [Watched Folders & Change Timeline](https://arahman200165.github.io/DUDE/tools/watched-folders) | File watching; Native filesystem access |
| [WHOIS Lookup](https://arahman200165.github.io/DUDE/tools/whois-lookup) | Native network diagnostics |
| [XML Formatter](https://arahman200165.github.io/DUDE/tools/xml-formatter) | Desktop file/folder open |
| [YAML ↔ JSON Converter](https://arahman200165.github.io/DUDE/tools/yaml-json) | Desktop file/folder open |

## Web Capability Matrix

Every tool not listed here behaves identically on the web companion and the desktop app.

| Tool | Desktop capability | On the web | What desktop adds |
| --- | --- | --- | --- |
| [Batch Operations](https://arahman200165.github.io/DUDE/tools/batch-operations) | Native filesystem write | Desktop-only feature | undoes journaled file changes through the desktop mutation engine |
| [Batch Rename](https://arahman200165.github.io/DUDE/tools/batch-rename) | Native filesystem access | Desktop-only feature | lists real folders in the desktop fs worker |
| [Batch Rename](https://arahman200165.github.io/DUDE/tools/batch-rename) | Native filesystem write | Desktop-only feature | renames only through a previewed, journaled, undoable plan |
| [Batch Text Converter](https://arahman200165.github.io/DUDE/tools/batch-text-converter) | Native filesystem access | Desktop-only feature | reads real folders and re-encodes with iconv-lite in the desktop fs worker |
| [Batch Text Converter](https://arahman200165.github.io/DUDE/tools/batch-text-converter) | Native filesystem write | Desktop-only feature | rewrites files only through a previewed, loss-checked, undoable plan |
| [Certificate Watch List](https://arahman200165.github.io/DUDE/tools/certificate-watch-list) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [TCP/HTTP Connectivity Tester](https://arahman200165.github.io/DUDE/tools/connectivity-tester) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Certificate Transparency Lookup](https://arahman200165.github.io/DUDE/tools/ct-lookup) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Directory Diff](https://arahman200165.github.io/DUDE/tools/directory-diff) | File watching | Desktop-only feature | optionally rescans open folders when their contents change |
| [Directory Diff](https://arahman200165.github.io/DUDE/tools/directory-diff) | Native filesystem access | Works — weaker browser fallback | compares real folders on disk, not zipped/pasted file lists |
| [Directory Tree Generator](https://arahman200165.github.io/DUDE/tools/directory-tree-generator) | Native filesystem access | Desktop-only feature | walks real folders on disk in the desktop fs worker |
| [Directory Tree Generator](https://arahman200165.github.io/DUDE/tools/directory-tree-generator) | Native filesystem write | Desktop-only feature | writes the generated tree into the folder only through a previewed, confirmed plan |
| [DNS Lookup](https://arahman200165.github.io/DUDE/tools/dns-lookup) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [DNS Propagation Tester](https://arahman200165.github.io/DUDE/tools/dns-propagation) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [DNSSEC Inspector](https://arahman200165.github.io/DUDE/tools/dnssec-inspector) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Duplicate Files](https://arahman200165.github.io/DUDE/tools/duplicate-files) | Native filesystem access | Desktop-only feature | scans and hashes real folders and drives in the desktop fs worker |
| [Duplicate Files](https://arahman200165.github.io/DUDE/tools/duplicate-files) | Native filesystem write | Desktop-only feature | moves selected extra copies to the Recycle Bin through a previewed, journaled plan |
| [Email Auth Inspector](https://arahman200165.github.io/DUDE/tools/email-auth-inspector) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [File Split & Join](https://arahman200165.github.io/DUDE/tools/file-split-join) | Native filesystem access | Desktop-only feature | reads real files and part folders in the desktop fs worker |
| [File Split & Join](https://arahman200165.github.io/DUDE/tools/file-split-join) | Native filesystem write | Desktop-only feature | writes parts and joined files only through a previewed, verified, journaled plan |
| [Folder Size Analyzer](https://arahman200165.github.io/DUDE/tools/folder-size-analyzer) | Native filesystem access | Desktop-only feature | scans real folders and drives in the desktop fs worker |
| [Folder Size Analyzer](https://arahman200165.github.io/DUDE/tools/folder-size-analyzer) | Native filesystem write | Desktop-only feature | moves selected items to the Recycle Bin through a previewed, journaled plan |
| [Git Repo Browser](https://arahman200165.github.io/DUDE/tools/git-diff) | File watching | Desktop-only feature | optionally refreshes the worktree and git metadata when they change |
| [Git Repo Browser](https://arahman200165.github.io/DUDE/tools/git-diff) | Native filesystem access | Works — weaker browser fallback | reads a real .git directory on disk, no upload/zip step |
| [Hash Manifest & Snapshot](https://arahman200165.github.io/DUDE/tools/hash-manifest) | Native filesystem access | Desktop-only feature | streams and hashes whole folders in the desktop fs worker |
| [Hostname Resolver](https://arahman200165.github.io/DUDE/tools/hostname-resolver) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [HTTPS Configuration Analyzer](https://arahman200165.github.io/DUDE/tools/https-config-analyzer) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Large-File Streaming Inspector](https://arahman200165.github.io/DUDE/tools/large-file-inspector) | File watching | Desktop-only feature | follows a growing file (tail -f) |
| [Large-File Streaming Inspector](https://arahman200165.github.io/DUDE/tools/large-file-inspector) | Native filesystem access | Desktop-only feature | reads byte ranges and streams search over files of any size on disk |
| [Continuous Ping / Latency Graph](https://arahman200165.github.io/DUDE/tools/latency-monitor) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Live Certificate Chain Fetcher](https://arahman200165.github.io/DUDE/tools/live-certificate-chain) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Local Network Viewer](https://arahman200165.github.io/DUDE/tools/local-network) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Advanced Markdown Workspace](https://arahman200165.github.io/DUDE/tools/markdown-workspace) | Collaboration relay | Desktop-only feature | collaborate across networks via a self-hosted relay |
| [MTU Discovery](https://arahman200165.github.io/DUDE/tools/mtu-discovery) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Network Diagnostic Bundle Export](https://arahman200165.github.io/DUDE/tools/network-diagnostic-bundle) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Packet-Loss Measurement](https://arahman200165.github.io/DUDE/tools/packet-loss) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Ping](https://arahman200165.github.io/DUDE/tools/ping) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Port Scanner](https://arahman200165.github.io/DUDE/tools/port-scanner) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Public IP Detector](https://arahman200165.github.io/DUDE/tools/public-ip) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Regex Tester](https://arahman200165.github.io/DUDE/tools/regex) | Local LLM proxy | Desktop-only feature | AI-assisted explain/generate via a local LLM proxy, no cloud key required |
| [Reverse DNS Lookup](https://arahman200165.github.io/DUDE/tools/reverse-dns) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Certificate Revocation Inspector](https://arahman200165.github.io/DUDE/tools/revocation-inspector) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Route Comparison](https://arahman200165.github.io/DUDE/tools/route-comparison) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [STARTTLS Inspector](https://arahman200165.github.io/DUDE/tools/starttls-inspector) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [System Changes](https://arahman200165.github.io/DUDE/tools/system-changes) | Native Windows system access | Desktop-only feature | manages the local snapshot library used by the environment, PATH and registry diffs |
| [System Changes](https://arahman200165.github.io/DUDE/tools/system-changes) | Native Windows system changes | Desktop-only feature | undoes journaled Windows system changes through the desktop system mutation engine |
| [TCP Port Tester](https://arahman200165.github.io/DUDE/tools/tcp-port-tester) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [TLS Connection Inspector](https://arahman200165.github.io/DUDE/tools/tls-inspector) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Traceroute](https://arahman200165.github.io/DUDE/tools/traceroute) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Tree Search](https://arahman200165.github.io/DUDE/tools/tree-search) | Native filesystem access | Desktop-only feature | searches real folders in the desktop fs worker |
| [Tree Search](https://arahman200165.github.io/DUDE/tools/tree-search) | Native filesystem write | Desktop-only feature | replaces across files only through a previewed, per-hunk, journaled plan |
| [UDP Port Tester](https://arahman200165.github.io/DUDE/tools/udp-port-tester) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |
| [Watched Folders & Change Timeline](https://arahman200165.github.io/DUDE/tools/watched-folders) | File watching | Desktop-only feature | watches remembered folders in the desktop main process, including while hidden to the tray |
| [Watched Folders & Change Timeline](https://arahman200165.github.io/DUDE/tools/watched-folders) | Native filesystem access | Desktop-only feature | picks and remembers the folders to watch |
| [WHOIS Lookup](https://arahman200165.github.io/DUDE/tools/whois-lookup) | Native network diagnostics | Desktop-only feature | runs live checks through the Windows desktop network bridge |

Optional runtimes are cached on demand by the web service worker the first time the tool needs
them (never prefetched), and ship locally inside the desktop app.

| Tool | Optional runtime |
| --- | --- |
| [Python Playground](https://arahman200165.github.io/DUDE/tools/python-playground) | Pyodide (Python/WASM) |
| [SQLite File Viewer](https://arahman200165.github.io/DUDE/tools/sqlite-viewer) | sql.js (SQLite/WASM) |
| [Template Renderer](https://arahman200165.github.io/DUDE/tools/template-renderer) | EJS template engine |
| [XML Schema / XSD Validator](https://arahman200165.github.io/DUDE/tools/xml-xsd-validator) | xmllint (libxml2/WASM) |
