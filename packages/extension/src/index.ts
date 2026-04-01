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
    outputChannel.appendLine('[activate] extension stopped: plugin connection unavailable');
    return;
  }

  outputChannel.appendLine('[activate] plugin connection established');

  context.subscriptions.push(connection);

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(hoverSelectors, new HoverProvider(connection)),
  );

  const [ViewCommandName, ViewCommandImpl] = getViewService().command;
  context.subscriptions.push(vscode.commands.registerCommand(ViewCommandName, ViewCommandImpl));

  const [ViewAtCursorCommandName, ViewAtCursorCommandImpl] =
    getViewAtCursorService(connection).command;
  context.subscriptions.push(
    vscode.commands.registerCommand(ViewAtCursorCommandName, ViewAtCursorCommandImpl),
  );

  const [DocumentProviderName, DocumentProviderImpl] = getViewService().documentProvider;
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(DocumentProviderName, {
      provideTextDocumentContent: DocumentProviderImpl,
    }),
  );

  const [CopyExpandTypeScriptCommandName, CopyExpandTypeScriptCommandImpl] =
    getExpandTypeScriptService().command;
  context.subscriptions.push(
    vscode.commands.registerCommand(
      CopyExpandTypeScriptCommandName,
      CopyExpandTypeScriptCommandImpl,
    ),
  );

  outputChannel.appendLine('[activate] extension activated successfully');
}

function logEnvironmentInfo(context: vscode.ExtensionContext) {
  const extensionVersion = context.extension.packageJSON?.version ?? 'unknown';
  outputChannel.appendLine(`[env] TS Viewer v${extensionVersion}`);
  outputChannel.appendLine(`[env] VS Code v${vscode.version}`);

  const tsExtension = vscode.extensions.getExtension('vscode.typescript-language-features');
  outputChannel.appendLine(
    `[env] TypeScript extension: ${
      tsExtension ? `v${tsExtension.packageJSON?.version ?? 'unknown'}` : 'NOT FOUND'
    }`,
  );

  const vueExtension = vscode.extensions.getExtension('Vue.volar');
  outputChannel.appendLine(
    `[env] Vue Official extension: ${
      vueExtension ? `v${vueExtension.packageJSON?.version ?? 'unknown'}` : 'not installed'
    }`,
  );

  const folders = vscode.workspace.workspaceFolders;
  outputChannel.appendLine(`[env] workspace folders: ${folders?.length ?? 0}`);
}
