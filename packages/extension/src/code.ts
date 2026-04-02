import * as vscode from 'vscode';

import { ExpiringCache } from '@ts-viewer/shared';
import { getType } from './api';
import { selectors } from './constants';
import type { PluginConnection } from './connection';
import { createTypeInfoPayload, toViewRequest, type TypeInfoPayload } from './type-info';
import { isVueTypeScriptDocument } from './vue';
import { getViewService } from './webview';
import { getExpandTypeScriptService } from './helper';

const ViewAtCursorCommandName = 'ts-viewer.view-at-cursor';
const HoverCacheTtlMs = 1000;
const MaxHoverCacheSize = 64;

let outputChannel: vscode.OutputChannel = vscode.window.createOutputChannel('TS Viewer');

export function setSharedOutputChannel(channel: vscode.OutputChannel) {
  outputChannel = channel;
}

export function getSharedOutputChannel() {
  return outputChannel;
}

export class HoverProvider implements vscode.HoverProvider {
  private readonly cache = new ExpiringCache<string, TypeInfoPayload | null>({
    ttlMs: HoverCacheTtlMs,
    maxSize: MaxHoverCacheSize,
  });

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

    const cached = this.cache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }

    const value = await resolveTypeInfo(
      document,
      position,
      range,
      this.connection,
      cancellationToken,
    );
    if (cancellationToken?.isCancellationRequested) {
      return null;
    }

    this.cache.set(cacheKey, value);

    return value;
  }
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

  if (editor.document.languageId === 'vue' && !isVueTypeScriptDocument(editor.document)) {
    vscode.window.showInformationMessage(
      '[TS Viewer] Only Vue files with <script lang="ts"> or <script lang="tsx"> are supported.',
    );
    return;
  }

  const range = editor.document.getWordRangeAtPosition(editor.selection.active);
  const typeInfo = await resolveTypeInfo(
    editor.document,
    editor.selection.active,
    range,
    connection,
  );
  if (!typeInfo) {
    vscode.window.showInformationMessage(
      '[TS Viewer] No type information was found at the cursor.',
    );
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

  if (document.languageId === 'vue') {
    return !isVueTypeScriptDocument(document);
  }

  return false;
}

function getSymbolName(document: vscode.TextDocument, range: vscode.Range | undefined) {
  const currentWord = range ? document.getText(range).trim() : '';
  const fallbackWord = currentWord || 'TypeInfo';
  return fallbackWord.replace(/^\w/, (char) => char.toUpperCase());
}
