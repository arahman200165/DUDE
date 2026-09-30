// Spawned by focused file-lock integration tests; intentionally exits only after stdin closes.
const fs = require('node:fs');
const file = process.argv[2];
const handle = fs.openSync(file, 'r');
process.stdout.write('ready\n');
process.stdin.resume();
process.stdin.on('end', () => { fs.closeSync(handle); process.exit(0); });
