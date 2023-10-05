import * as vscode from 'vscode';
import { getPluginConfig } from './connection';
import { selectors } from './constants';

import { HoverProvider } from './code';

import { getViewService } from './webview';

const DefaultPort = 3200;

export async function activate(context: vscode.ExtensionContext) {
  const { port } = (await getPluginConfig(DefaultPort)) ?? {};
  if (!port) {
    return;
  }

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(selectors, new HoverProvider(context, port)),
  );

  const [ViewCommandName, ViewCommandImpl] = getViewService().command;
  context.subscriptions.push(vscode.commands.registerCommand(ViewCommandName, ViewCommandImpl));

  const [DocumentProviderName, DocumentProviderImpl] = getViewService().documentProvider;
  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(DocumentProviderName, {
      provideTextDocumentContent: DocumentProviderImpl,
    }),
  );
}
