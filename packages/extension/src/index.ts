import * as vscode from 'vscode';
import { createPluginConnection } from './connection';
import { hoverSelectors } from './constants';

import { getViewAtCursorService, HoverProvider, setSharedOutputChannel } from './code';
import { getViewService } from './webview';
import { getExpandTypeScriptService } from './helper';

const DefaultPort = 3200;

const outputChannel = vscode.window.createOutputChannel('TS Viewer');

export async function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(outputChannel);
  setSharedOutputChannel(outputChannel);

  logEnvironmentInfo(context);

  const connection = await createPluginConnection(DefaultPort, outputChannel);
  if (!connection) {
    outputChannel.appendLine(
      '[ts-viewer:activate] extension stopped: plugin connection unavailable',
    );
    return;
  }

  outputChannel.appendLine('[ts-viewer:activate] plugin connection established');

  context.subscriptions.push(connection);

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(hoverSelectors, new HoverProvider(connection)),
  );

  const viewService = getViewService();
  const commands: readonly (readonly [string, (...args: never[]) => unknown])[] = [
    viewService.command,
    getViewAtCursorService(connection).command,
    getExpandTypeScriptService().command,
  ];

  for (const [name, impl] of commands) {
    context.subscriptions.push(vscode.commands.registerCommand(name, impl));
  }

  const [documentProviderName, documentProviderImpl] = viewService.documentProvider;
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(documentProviderName, {
      provideTextDocumentContent: documentProviderImpl,
    }),
  );

  outputChannel.appendLine('[ts-viewer:activate] extension activated successfully');
}

function logEnvironmentInfo(context: vscode.ExtensionContext) {
  const extensionVersion = context.extension.packageJSON?.version ?? 'unknown';
  outputChannel.appendLine(`[ts-viewer:env] TS Viewer v${extensionVersion}`);
  outputChannel.appendLine(`[ts-viewer:env] VS Code v${vscode.version}`);

  const tsExtension = vscode.extensions.getExtension('vscode.typescript-language-features');
  outputChannel.appendLine(
    `[ts-viewer:env] TypeScript extension: ${
      tsExtension ? `v${tsExtension.packageJSON?.version ?? 'unknown'}` : 'NOT FOUND'
    }`,
  );

  const vueExtension = vscode.extensions.getExtension('Vue.volar');
  outputChannel.appendLine(
    `[ts-viewer:env] Vue Official extension: ${
      vueExtension ? `v${vueExtension.packageJSON?.version ?? 'unknown'}` : 'not installed'
    }`,
  );

  const folders = vscode.workspace.workspaceFolders;
  outputChannel.appendLine(`[ts-viewer:env] workspace folders: ${folders?.length ?? 0}`);
}
