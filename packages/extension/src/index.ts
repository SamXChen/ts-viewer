import * as vscode from 'vscode';
import { getPluginConfig } from './connection';
import { selectors } from './constants';
import { InlayHintProvider } from './code';

const DefaultPort = 3200;

export async function activate(context: vscode.ExtensionContext) {
  const { port } = (await getPluginConfig(DefaultPort)) ?? {};
  if (!port) {
    return;
  }

  context.subscriptions.push(
    vscode.languages.registerInlayHintsProvider(selectors, new InlayHintProvider(port)),
  );
}
