import * as vscode from 'vscode';

import { getInlayHints } from './api';
import { runWithCancelToken } from './utils';

class InlayHintsWithFileName extends vscode.InlayHint {
  constructor(
    public fileName: string,
    position: vscode.Position,
    label: string | vscode.InlayHintLabelPart[],
    kind?: vscode.InlayHintKind,
  ) {
    super(position, label, kind);
  }
}

export class InlayHintProvider implements vscode.InlayHintsProvider<InlayHintsWithFileName> {
  constructor(private port: number) {}

  async provideInlayHints(
    document: vscode.TextDocument,
    range: vscode.Range,
    token: vscode.CancellationToken,
  ) {
    try {
      const resp = await runWithCancelToken(token, () => {
        return getInlayHints(document, range, this.port);
      });
      return resp.hints.map((hint) => {
        const position = document.positionAt(hint.position);
        const inlayHint = new InlayHintsWithFileName(document.fileName, position, hint.text);
        inlayHint.paddingLeft = hint.whitespaceBefore;
        inlayHint.paddingRight = hint.whitespaceAfter;
        return inlayHint;
      });
    } catch (err) {
      console.error(err);
      return [];
    }
  }
}
