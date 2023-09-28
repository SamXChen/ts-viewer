import { GetInlayHintsRequest, GetInlayHintsResponse } from '@ts-faker/shared';

import axios from 'axios';
import * as vscode from 'vscode';

export async function getInlayHints(
  document: vscode.TextDocument,
  range: vscode.Range,
  port: number,
) {
  const start = document.offsetAt(range.start);
  const end = document.offsetAt(range.end);
  const req: GetInlayHintsRequest = {
    fileName: document.fileName,
    span: {
      start,
      length: end - start,
    },
    preference: {
      includeInlayParameterNameHints: vscode.workspace
        .getConfiguration('typescript.inlayHints')
        .get('parameterNames.enabled'),
    },
  };

  const result = await axios.post<GetInlayHintsResponse>(
    `http://localhost:${port}/inlay-hints`,
    req,
  );
  return result.data;
}
