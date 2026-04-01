import * as cp from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface PackageJson {
  version: string;
}

const extensionDir = path.resolve(__dirname, '..');
const packageJsonPath = path.resolve(extensionDir, 'package.json');
const manifest = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8')) as PackageJson;
const vsixFileName = `ts-viewer-extension-${manifest.version}.vsix`;
const vsixPath = path.resolve(extensionDir, vsixFileName);

const pluginDir = path.resolve(extensionDir, 'node_modules/ts-viewer-language-plugin');
const pluginPackageJsonPath = path.resolve(pluginDir, 'package.json');
const pluginRuntimeEntryPath = path.resolve(pluginDir, 'dist', 'index.js');
const pluginTypeEntryPath = path.resolve(pluginDir, 'dist', 'index.d.ts');

const stagingRoot = path.resolve(extensionDir, '.vsix-staging');
const stagedPluginDir = path.resolve(
  stagingRoot,
  'extension',
  'node_modules',
  'ts-viewer-language-plugin',
);

main();

function main() {
  ensurePathExists(pluginPackageJsonPath, 'TypeScript plugin package.json');
  ensurePathExists(pluginRuntimeEntryPath, 'TypeScript plugin runtime entry');

  runCommand('pnpm', ['exec', 'vsce', 'package', '--no-dependencies', '--githubBranch', 'main'], {
    cwd: extensionDir,
  });

  fs.rmSync(stagingRoot, { force: true, recursive: true });
  fs.mkdirSync(stagedPluginDir, { recursive: true });

  fs.copyFileSync(pluginPackageJsonPath, path.resolve(stagedPluginDir, 'package.json'));
  fs.mkdirSync(path.resolve(stagedPluginDir, 'dist'), { recursive: true });
  fs.copyFileSync(pluginRuntimeEntryPath, path.resolve(stagedPluginDir, 'dist', 'index.js'));

  if (fs.existsSync(pluginTypeEntryPath)) {
    fs.copyFileSync(pluginTypeEntryPath, path.resolve(stagedPluginDir, 'dist', 'index.d.ts'));
  }

  runCommand('zip', ['-ur', vsixPath, 'extension/node_modules/ts-viewer-language-plugin'], {
    cwd: stagingRoot,
  });

  fs.rmSync(stagingRoot, { force: true, recursive: true });
}

function ensurePathExists(targetPath: string, label: string) {
  if (!fs.existsSync(targetPath)) {
    throw new Error(`${label} not found: ${targetPath}`);
  }
}

function runCommand(command: string, args: string[], options: cp.ExecFileSyncOptions) {
  cp.execFileSync(command, args, {
    ...options,
    stdio: 'inherit',
  });
}
