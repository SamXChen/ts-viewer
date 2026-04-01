import type * as vscode from 'vscode';
import { vueSelector, vueHoverSelectors } from './vue';

export const selectors = [
  'typescript',
  'typescriptreact',
  'javascript',
  'javascriptreact',
  vueSelector,
];

export const probeSelectors = ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'];

export const hoverSelectors: vscode.DocumentFilter[] = [
  { language: 'typescript', scheme: 'file' },
  { language: 'typescriptreact', scheme: 'file' },
  { language: 'javascript', scheme: 'file' },
  { language: 'javascriptreact', scheme: 'file' },
  { language: 'typescript', scheme: 'untitled' },
  { language: 'typescriptreact', scheme: 'untitled' },
  { language: 'javascript', scheme: 'untitled' },
  { language: 'javascriptreact', scheme: 'untitled' },
  ...vueHoverSelectors,
];

export const typeScriptExtensionId = 'vscode.typescript-language-features';

export const pluginId = 'ts-viewer-language-plugin';
