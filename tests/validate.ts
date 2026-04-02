import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsRoot, '..');

function run(label: string, command: string) {
  console.log(`[validate] ${label}`);
  try {
    execSync(command, { cwd: repoRoot, stdio: 'inherit' });
  } catch {
    throw new Error(`Validation step failed: ${label}`);
  }
}

run('build shared', 'pnpm --filter @ts-viewer/shared build');
run('static fixture validation', `tsx ${path.join(testsRoot, 'scripts', 'validate-smoke-fixtures.ts')}`);
