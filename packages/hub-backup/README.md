# @dude/hub-backup

Private internal package. Portable encrypted backup file format for the self-hosted Hub (`.dudebackup`). It uses no Node built-ins or host globals: the passphrase key-derivation function (the Hub injects Node's Argon2id), the random source and the clock are injected through `BackupDeps`.

Layout: `DUDEBKUP` magic, a big-endian u32 header length, a plaintext JSON header (reader information only: versions, KDF name and parameters, salt, cipher, chunk size, stream id), then length-prefixed XChaCha20-Poly1305 chunks. Each chunk's nonce is the stream id plus a chunk counter and its associated data is the SHA-256 of the header plus a final-chunk flag, so reordering, truncation, header tampering and a wrong passphrase all fail authentication. The manifest and every file live inside the encrypted stream. Consume compiled exports; never import application source.
