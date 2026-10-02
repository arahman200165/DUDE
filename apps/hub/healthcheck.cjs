// Container HEALTHCHECK: GET /api/v1/hello over HTTPS, trusting only the Hub's own certificate.
'use strict';
const fs = require('node:fs');
const https = require('node:https');
const dataDir = process.env.DUDE_HUB_DATA_DIR || '/data';
const port = Number(process.env.DUDE_HUB_PORT || 47600);
let ca;
try {
  ca = fs.readFileSync(`${dataDir}/config/tls/cert.pem`);
} catch {
  process.exit(1);
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
