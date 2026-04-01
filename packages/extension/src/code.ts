import * as vscode from 'vscode';

import { getType } from './api';
import { selectors } from './constants';
import type { PluginConnection } from './connection';
import { createTypeInfoPayload, toViewRequest, type TypeInfoPayload } from './type-info';
import { getViewService } from './webview';
import { getExpandTypeScriptService } from './helper';

const ViewAtCursorCommandName = 'ts-viewer.view-at-cursor';
const HoverCacheTtlMs = 1000;
const MaxHoverCacheSize = 64;

const outputChannel = vscode.window.createOutputChannel('TS Viewer');

export class HoverProvider implements vscode.HoverProvider {
  private readonly cache = new Map<string, { expiresAt: number; value: TypeInfoPayload | null }>();

  constructor(private readonly connection: PluginConnection) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.Hover | null | undefined> {
    if (shouldSkipHoverDocument(document)) {
      return;
    }

    const range = document.getWordRangeAtPosition(position);
    const typeInfo = await this.resolveTypeInfo(document, position, range, token);
    if (token.isCancellationRequested || !typeInfo) {
      return;
    }

    const label = new vscode.MarkdownString('TS Viewer');
    const link = getViewService().genViewLink('View Full Type', toViewRequest(typeInfo));

    const expandTypeScriptLink = getExpandTypeScriptService().getExpandTypeScriptLink();

    return new vscode.Hover([label, link, expandTypeScriptLink], range);
  }

  private async resolveTypeInfo(
    document: vscode.TextDocument,
    position: vscode.Position,
    range: vscode.Range | undefined,
    cancellationToken?: vscode.CancellationToken,
  ) {
    const cacheKey = getCacheKey(document, position);
    const now = Date.now();

    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.value;
    }

    if (cached) {
      this.cache.delete(cacheKey);
    }

    const value = await resolveTypeInfo(document, position, range, this.connection, cancellationToken);
    if (cancellationToken?.isCancellationRequested) {
      return null;
    }

    this.cache.set(cacheKey, {
      expiresAt: now + HoverCacheTtlMs,
      value,
    });

    while (this.cache.size > MaxHoverCacheSize) {
      const firstKey = this.cache.keys().next().value;
      if (!firstKey) {
        break;
      }
      this.cache.delete(firstKey);
    }

    return value;
  }
}

export function getTypeInfoOutputChannel() {
  return outputChannel;
}

export function getViewAtCursorService(connection: PluginConnection) {
  return {
    command: [ViewAtCursorCommandName, () => viewAtCursorImpl(connection)],
  } as const;
}

async function viewAtCursorImpl(connection: PluginConnection) {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  if (!selectors.includes(editor.document.languageId)) {
    vscode.window.showInformationMessage('[TS Viewer] The active editor is not supported.');
    return;
  }

  const range = editor.document.getWordRangeAtPosition(editor.selection.active);
  const typeInfo = await resolveTypeInfo(editor.document, editor.selection.active, range, connection);
  if (!typeInfo) {
    vscode.window.showInformationMessage('[TS Viewer] No type information was found at the cursor.');
    return;
  }

  await getViewService().openView(toViewRequest(typeInfo));
}

async function resolveTypeInfo(
  document: vscode.TextDocument,
  position: vscode.Position,
  range: vscode.Range | undefined,
  connection: PluginConnection,
  cancellationToken?: vscode.CancellationToken,
) {
  const res = await getType(document, position, connection, {
    cancellationToken,
  });
  if (!res) {
    return null;
  }

  if (res.type === 'error') {
    outputChannel.appendLine(`[type-info] ${res.data}`);
    return null;
  }

  const typeString = res.data?.trim();
  if (!typeString) {
    return null;
  }

  const symbolName = getSymbolName(document, range);
  return createTypeInfoPayload(typeString, symbolName);
}

function getCacheKey(document: vscode.TextDocument, position: vscode.Position) {
  return `${document.uri.toString()}:${document.version}:${document.offsetAt(position)}`;
}

function shouldSkipHoverDocument(document: vscode.TextDocument) {
  if (document.uri.scheme !== 'file' && document.uri.scheme !== 'untitled') {
    return true;
  }

  const normalizedResource = `${document.fileName}\n${document.uri.toString()}`.toLowerCase();
  return normalizedResource.endsWith('.vue') || normalizedResource.includes('.vue.');
}

function getSymbolName(document: vscode.TextDocument, range: vscode.Range | undefined) {
  const currentWord = range ? document.getText(range).trim() : '';
  const fallbackWord = currentWord || 'TypeInfo';
  return fallbackWord.replace(/^\w/, (char) => char.toUpperCase());
}
