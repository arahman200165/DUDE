import { runCli } from './cli/run.js';
import { runSelfTest, runSelfTestCommand } from './cli/self-test.js';

// Self-test hook: the `self-test` command, and a fail-fast runtime check before `run` opens anything.
async function main(argv: string[]): Promise<number> {
  if (argv[0] === 'self-test') return runSelfTestCommand();
  if (argv[0] === 'run') {
    const result = await runSelfTest();
    if (!result.ok) {
      const failed = result.checks.filter((c) => !c.ok).map((c) => `  ${c.name}: ${c.detail ?? 'failed'}`);
      process.stderr.write(`Runtime self-test failed:\n${failed.join('\n')}\n`);
      return 1;
    }
  }
  return runCli(argv);
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
  },
);
