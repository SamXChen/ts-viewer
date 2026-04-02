import { execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testsRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testsRoot, '..');

function run(command: string) {
  execSync(command, { cwd: repoRoot, stdio: 'inherit' });
}

run('pnpm --filter @ts-viewer/shared build');
run(`tsx ${path.join(testsRoot, 'scripts', 'validate-smoke-fixtures.ts')}`);
