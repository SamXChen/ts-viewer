import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsRoot, '..');

function run(label: string, command: string) {
  console.log(`[test] ${label}`);
  try {
    execSync(command, { cwd: repoRoot, stdio: 'inherit' });
  } catch {
    throw new Error(`Test step failed: ${label}`);
  }
}

run('fixture usage', `tsx ${path.join(testsRoot, 'scripts', 'run-fixture-usage-smoke.ts')}`);
run('extension interaction', `tsx ${path.join(testsRoot, 'scripts', 'run-extension-interaction-smoke.ts')}`);
run('service stability', `tsx ${path.join(testsRoot, 'scripts', 'run-service-stability-smoke.ts')}`);
