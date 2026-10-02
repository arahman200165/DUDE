# X.509 golden corpus

isrg-root-x1.der is the real ISRG Root X1 public root certificate, exported from the Windows
LocalMachine trusted-root store on 2026-09-26. It is also published by Let's Encrypt at
https://letsencrypt.org/certs/isrgrootx1.der. The Windows certificate provider reports SHA-1
thumbprint CABD2A79A1076A31F21D253635CB039D4329A5E8, serial
008210CFB0D240E3594463E0BB63828B00, and subject/issuer CN=ISRG Root X1, O=Internet Security
Research Group, C=US. Windows Get-FileHash -Algorithm SHA256 reports the fixture file hash
96BCEC06264976F37460779ACF28C5A7CFE8A3C0AAE11A8FFCEE05C0BDDF08C6.

The X.509 golden-corpus spec parses the DER bytes and asserts the independently observed thumbprint,
serial, identity, CA constraints, and key usages. Dev-time test fixture only; it is not included in
the app's asset globs.