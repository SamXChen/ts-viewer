import * as vscode from 'vscode';
import * as cp from 'child_process';

const logger = vscode.window.createOutputChannel('ts-viewer');

export async function installDependencies(context: vscode.ExtensionContext) {
  const extensionPath = context.extension.extensionPath;
  logger.appendLine('Extension path: ' + extensionPath);

  if (await detectDependencies(context)) {
    logger.appendLine('Dependencies already installed.');
    return;
  }
  logger.appendLine('Installing dependencies...');
  vscode.window.showInformationMessage('[Ts-Viewer-Extension] Installing dependencies...');

  await implInstallDependencies(context);
  logger.appendLine('Dependencies installed.');

  vscode.window
    .showInformationMessage('[Ts-Viewer-Extension] Dependencies installed.', 'Reload')
    .then((value) => {
      if (value === 'Reload') {
        vscode.commands.executeCommand('workbench.action.reloadWindow');
      }
    });
}

function detectDependencies(context: vscode.ExtensionContext) {
  const extensionPath = context.extension.extensionPath;
  return new Promise((resolve) => {
    cp.exec(
      'npm ls --prod --silent --json',
      {
        cwd: extensionPath,
      },
      (err, stdout, stderr) => {
        if (err) {
          logger.appendLine(err.message);
          resolve(false);
          return;
        }
        logger.appendLine(stdout);
        logger.appendLine(stderr);
        resolve(true);
      },
    );
  });
}

function implInstallDependencies(context: vscode.ExtensionContext) {
  const extensionPath = context.extension.extensionPath;
  return new Promise((resolve, reject) => {
    cp.exec(
      'npm install --production',
      {
        cwd: extensionPath,
      },
      (err, stdout, stderr) => {
        if (err) {
          logger.appendLine(err.message);
          reject(err);
          return;
        }
        logger.appendLine(stdout);
        logger.appendLine(stderr);
        resolve('');
      },
    );
  });
}
