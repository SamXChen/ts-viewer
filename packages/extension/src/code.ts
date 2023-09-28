import * as vscode from 'vscode';

import prettier from 'prettier';

import { getType } from './api';
import { getViewService } from './webview';
import { getExpandTypeScriptService } from './helper';

export class HoverProvider implements vscode.HoverProvider {
  constructor(private context: vscode.ExtensionContext, private port: number) {}

  async provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): Promise<vscode.Hover | null | undefined> {
    const range = document.getWordRangeAtPosition(position);

    const res = await getType(document, position, this.port);
    if (!res) {
      return;
    }
    if (res.type === 'error') {
      console.error('error', res.data);
      return;
    }

    const typeString = res.data ?? '';
    if (!typeString) {
      return;
    }

    const currentWord = document.getText(range);
    const currentWordWithUpperFirst = currentWord.replace(/^\w/, (c) => c.toUpperCase());

    const validTypeString = ensureTypeStringValid(typeString, currentWordWithUpperFirst);

    let prettierTypeString = validTypeString;
    try {
      prettierTypeString = prettier.format(validTypeString, {
        parser: 'typescript',
      });
    } catch {
      // noop
    }

    const link = getViewService().genViewLink('View Type Info', {
      title: `ts-viewer.full-type.${currentWordWithUpperFirst}.d.ts`,
      text: prettierTypeString,
      language: 'typescript',
      commandList: ['editor.action.formatDocument'],
    });

    const expandTypeScriptLink = getExpandTypeScriptService().getExpandTypeScriptLink();

    return new vscode.Hover([link, expandTypeScriptLink], range);
  }
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
