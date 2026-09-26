# Phase 23 completion record

Phase 23 is complete through Milestone 406. All 277 tool manifests have `status: 'verified'`; the 228 tools in the Tier 5 ledger are all verified, with zero blocked entries. The other 49 were verified before that ledger was created. README's 276 showcase tools exclude the Settings configuration page, which is still a manifest and is included in the 277 total. No changes were pushed.

The Phase 23 item notes in `DUDE_PRD.md` summarize the final rollout. This report and `.phase23/ledger.json` retain the detailed evidence and tool-specific limits.

## Evidence

Verification metadata overlaps: 255 manifests declare property testing, 31 list published vectors, and 20 list independent cross-checks. These numbers describe the evidence recorded in manifests, not an assertion that every tool has every kind of test. The ledger names the recipe and tool-specific limits. In particular, the Barcode Reader has a real Chromium upload/decode test against an independently generated PNG instead of a property-test claim; Settings has generated-input persistence and confirmation-boundary integration tests.

Published vectors now cover representative encoding, authentication, URL/JSON, HTTP, CSV, IP, CBOR, and Protobuf standards. Security-sensitive and complex-format cross-checks use independent implementations including Node crypto/zlib, OpenSSL, ssh-keygen, Python archive libraries, and X.509 parsing. Exact-vector claims were withheld where a published example does not match the tool's API (for example, raw RFC 3492 Punycode payloads versus the full-domain converter, and byte-exact JWS output that the JWT Signer does not expose).

Golden fixtures cover PE, ELF, Mach-O, a real X.509 certificate, JSON, YAML, XML, SQLite, ZIP, TAR, and PNG. The opt-in performance corpus exercises hashing, diff, JSON, binary structures, archives, and directory comparison. Sandbox browser tests cover opaque origin, CSP denial of an unallowlisted script, a hard Worker stop, and Python iframe recreation. Electron tests cover the preload/path boundary. A deliberate failing high-consequence spec made the release gate fail; deliberately breaking iframe recreation made its browser regression test fail. Both negative controls were removed after verification.

## Final gates

- `npm test -- --watch=false`: 1,160 files, 7,661 tests passed.
- `npm run lint`: passed.
- `npm run test:e2e`: production build passed; subsequent full Chromium run passed 14/14 tests, including direct route, dashboard search, Ctrl+K, verified badge, offline cache, QR decode, and sandbox checks.
- `npm run test:electron`: 2 files, 7 tests passed.
- `npm run test:high-consequence`: 35 tagged tools; 85 files, 540 tests passed.
- `npm run test:perf`: 6 files, 7 tests passed.

The production build still emits its existing bundle-size and CommonJS warnings; it exits successfully.

## Bugs and limits found during rollout

| Tool or area | Finding and disposition |
| --- | --- |
| URL Normalizer | Fixed repeated trailing-slash handling so normalization is idempotent. |
| Image Metadata Inspector | Fixed signed 32-bit PNG width/height decoding. |
| JSON Pointer | Fixed the RFC 6901 empty pointer to resolve the document root; public behavior change flagged in the ledger. |
| K8s Manifest Diff | Rejects scalar/null YAML before tree comparison; public behavior change flagged. |
| Env Editor | Escapes backslashes and carriage returns during serialization; public behavior change flagged. |
| Package Metadata Inspector | Handles malformed successful registry responses safely; public behavior change flagged. |
| Random Data Generator | Uses a fixed reference date for seeded date/JWT output; public behavior change flagged. |
| Docker Run / Compose Converter; Git Command Builder | Corrected malformed public manifest title/description text; changes flagged. |
| PWA browser test | Removed an interfering offline deep-link probe, then asserted that visiting a tool adds lazy chunks to Cache Storage before offline reload. |
| Aspect Ratio Calculator | Known shared `simplifyRatio` edge case for two positive dimensions below 0.5 remains in the ledger: both round to zero and yield `Infinity:Infinity`. Its generated invariant covers positive integer pixel dimensions, the documented input domain. A shared utility behavior change needs separate review. |

The `verified` tier represents recorded internal test evidence and does not imply formal certification. Continue applying the domain-specific checklist in `ADDING_A_TOOL.md` to new tools.
