import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as cp from 'child_process';

export function installDependencies(context: vscode.ExtensionContext) {
  const extensionPath = context.extension.extensionPath;

  const logger = vscode.window.createOutputChannel('ts-viewer');
  logger.show();
  logger.appendLine('Extension path: ' + extensionPath);

  const nodeModulesPath = path.join(extensionPath, 'node_modules');
  if (fs.existsSync(nodeModulesPath)) {
    logger.appendLine('Dependencies already installed.');
    return;
  }
  logger.appendLine('Installing dependencies...');

  cp.exec(
    'npm install --production',
    {
      cwd: extensionPath,
    },
    (err, stdout, stderr) => {
      if (err) {
        logger.appendLine(err.message);
        return;
      }
      logger.appendLine(stdout);
      logger.appendLine(stderr);
    },
  );
}
