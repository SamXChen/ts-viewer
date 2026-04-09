import type * as vscode from 'vscode';

export const vueSelector = 'vue';

export const vueHoverSelectors: vscode.DocumentFilter[] = [{ language: 'vue', scheme: 'file' }];

const vueTypeScriptScriptPattern = /<script\b[^>]*\blang\s*=\s*["']tsx?["'][^>]*>/i;

export function isVueTypeScriptDocument(document: vscode.TextDocument) {
  if (document.languageId !== 'vue') {
    return false;
  }
  return vueTypeScriptScriptPattern.test(document.getText());
}
