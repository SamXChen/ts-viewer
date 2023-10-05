import axios from 'axios';
import * as vscode from 'vscode';

export async function getType(
  document: vscode.TextDocument,
  position: vscode.Position,
  port: number,
) {
  const offset = document.offsetAt(position);
  const req = {
    fileName: document.fileName,
    position: offset,
  };

  const result = await axios.post(`http://localhost:${port}/get-type`, req);
  console.info('[get-type][result]', result);
  return result.data;
}
