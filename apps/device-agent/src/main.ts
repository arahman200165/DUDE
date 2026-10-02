import { runAgent } from './agent.js';

/** Replaced at build time (`--define:__DUDE_VERSION__`); 'dev' when running unbundled. */
declare const __DUDE_VERSION__: string | undefined;
const AGENT_VERSION = typeof __DUDE_VERSION__ === 'string' ? __DUDE_VERSION__ : 'dev';

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main(): Promise<void> {
  if (process.argv.includes('--version')) {
    process.stdout.write(`${AGENT_VERSION}\n`);
    return;
  }
  const storeDir = argValue('--store-dir');
  if (!storeDir) {
    process.stderr.write('dude-agent: --store-dir <dir> is required\n');
    process.exit(2);
  }
  const agent = await runAgent({ storeDir, agentVersion: AGENT_VERSION, onExit: (code) => process.exit(code) });
  // Another agent already serves this store directory; nothing to do.
  if (agent.status === 'already-running') process.exit(0);
}

process.on('uncaughtException', (error) => { process.stderr.write(`dude-agent: fatal ${error.stack ?? error}\n`); process.exit(1); });
process.on('unhandledRejection', (error) => { process.stderr.write(`dude-agent: fatal ${String(error)}\n`); process.exit(1); });
void main();
