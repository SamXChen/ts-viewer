import * as vscode from 'vscode';

import { getType } from './api';
import { selectors } from './constants';
import type { PluginConnection } from './connection';
import { getViewService } from './webview';
import { getExpandTypeScriptService } from './helper';

const ViewAtCursorCommandName = 'ts-viewer.view-at-cursor';
const HoverCacheTtlMs = 1000;
const MaxHoverCacheSize = 64;
const PreviewMaxLines = 8;
const PreviewMaxChars = 600;

const outputChannel = vscode.window.createOutputChannel('TS Viewer');

interface TypeInfoPayload {
  preview: string;
  text: string;
  title: string;
}

export class HoverProvider implements vscode.HoverProvider {
  private readonly cache = new Map<string, { expiresAt: number; value: TypeInfoPayload | null }>();

  constructor(private readonly connection: PluginConnection) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
  ): Promise<vscode.Hover | null | undefined> {
    const range = document.getWordRangeAtPosition(position);
    const typeInfo = await this.resolveTypeInfo(document, position, range, token);
    if (token.isCancellationRequested || !typeInfo) {
      return;
    }

    const preview = new vscode.MarkdownString();
    preview.appendCodeblock(typeInfo.preview, 'typescript');

    const link = getViewService().genViewLink('View Full Type', toViewRequest(typeInfo));

    const expandTypeScriptLink = getExpandTypeScriptService().getExpandTypeScriptLink();

    return new vscode.Hover([preview, link, expandTypeScriptLink], range);
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
  const validTypeString = ensureTypeStringValid(typeString, symbolName);

  return {
    preview: createPreview(validTypeString),
    text: validTypeString,
    title: `ts-viewer.full-type.${symbolName}.d.ts`,
  } satisfies TypeInfoPayload;
}

function getCacheKey(document: vscode.TextDocument, position: vscode.Position) {
  return `${document.uri.toString()}:${document.version}:${document.offsetAt(position)}`;
}

function getSymbolName(document: vscode.TextDocument, range: vscode.Range | undefined) {
  const currentWord = range ? document.getText(range).trim() : '';
  const fallbackWord = currentWord || 'TypeInfo';
  return fallbackWord.replace(/^\w/, (char) => char.toUpperCase());
}

function createPreview(typeString: string) {
  const lines = typeString.split('\n');
  const preview = lines.slice(0, PreviewMaxLines).join('\n');
  const maybeTruncatedLines = lines.length > PreviewMaxLines ? `${preview}\n...` : preview;

  if (maybeTruncatedLines.length <= PreviewMaxChars) {
    return maybeTruncatedLines;
  }

  return `${maybeTruncatedLines.slice(0, PreviewMaxChars - 3)}...`;
}

function toViewRequest(typeInfo: TypeInfoPayload) {
  return {
    title: typeInfo.title,
    text: typeInfo.text,
    language: 'typescript',
    commandList: ['editor.action.formatDocument'],
  };
}

function ensureTypeStringValid(input: string, currentWord: string): string {
  if (!input) {
    return '';
  }
  if (input.startsWith('type')) {
    return input;
  }
  if (input.startsWith('interface')) {
    return input;
  }
  if (input.startsWith('enum')) {
    return input;
  }
  if (input.startsWith('declare')) {
    return input;
  }
  if (input.startsWith('export')) {
    return input;
  }
  return `type ${currentWord} = ${input}`;
}
