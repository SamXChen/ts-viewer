import * as vscode from 'vscode';
import { createPluginConnection } from './connection';
import { hoverSelectors } from './constants';

import { getTypeInfoOutputChannel, getViewAtCursorService, HoverProvider } from './code';
import { getViewService } from './webview';
import { getExpandTypeScriptService } from './helper';

const DefaultPort = 3200;

export async function activate(context: vscode.ExtensionContext) {
  const connection = await createPluginConnection(DefaultPort);
  if (!connection) {
    return;
  }

  context.subscriptions.push(connection);
  context.subscriptions.push(getTypeInfoOutputChannel());

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(hoverSelectors, new HoverProvider(connection)),
  );

  const [ViewCommandName, ViewCommandImpl] = getViewService().command;
  context.subscriptions.push(vscode.commands.registerCommand(ViewCommandName, ViewCommandImpl));

  const [ViewAtCursorCommandName, ViewAtCursorCommandImpl] = getViewAtCursorService(connection).command;
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
}
