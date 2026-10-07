// Container HEALTHCHECK: GET /api/v1/hello over HTTPS, trusting only the Hub's own certificate and,
// when the built-in local CA issued it, that CA's root (the leaf alone does not chain to itself).
'use strict';
const fs = require('node:fs');
const https = require('node:https');
const dataDir = process.env.DUDE_HUB_DATA_DIR || '/data';
const port = Number(process.env.DUDE_HUB_PORT || 47600);
const tlsDir = `${dataDir}/config/tls`;
let ca;
try {
  ca = [fs.readFileSync(`${tlsDir}/cert.pem`)];
} catch {
  process.exit(1);
}
try {
  ca.push(fs.readFileSync(`${tlsDir}/ca/ca-cert.pem`));
} catch {
  // No local CA: the certificate is self-signed or operator-supplied.
}
const req = https.get(
  { host: '127.0.0.1', port, path: '/api/v1/hello', ca, checkServerIdentity: () => undefined, timeout: 4000 },
  (res) => {
    res.resume();
    process.exit(res.statusCode === 200 ? 0 : 1);
  },
);
req.on('timeout', () => req.destroy());
req.on('error', () => process.exit(1));
