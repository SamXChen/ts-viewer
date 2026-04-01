import * as vscode from 'vscode';

const ViewCommandName = 'ts-viewer.view';
const DocumentProviderName = ViewCommandName + '.document-provider';

export interface ViewRequestParams {
  title?: string;
  text: string;
  language?: string;
  commandList?: string[];
}

const MaxViewRequestMapSize = 6;
const ViewRequestMap = new Map<
  string,
  {
    createTime: number;
    data: ViewRequestParams;
  }
>();

function setViewRequestMap(requestParams: ViewRequestParams) {
  const createTime = Date.now();
  const key = `${createTime}-${Math.random().toString(36).slice(-10)}`;

  ViewRequestMap.set(key, {
    createTime,
    data: requestParams,
  });
  while (ViewRequestMap.size > MaxViewRequestMapSize) {
    const minCreateTime = Math.min(
      ...Array.from(ViewRequestMap.values()).map((item) => item.createTime),
    );
    ViewRequestMap.delete(
      Array.from(ViewRequestMap.entries()).find((item) => item[1].createTime === minCreateTime)![0],
    );
  }

  return key;
}

async function viewImpl(index: string) {
  const indexInfo = ViewRequestMap.get(index);
  if (!indexInfo) {
    return;
  }

  const title = indexInfo.data?.title ?? 'ts-viewer';
  const uri = vscode.Uri.file(title).with({
    scheme: DocumentProviderName,
    path: title,
    query: `index=${index}`,
  });

  const doc = await vscode.workspace.openTextDocument(uri);
  const editor = await vscode.window.showTextDocument(doc, {
    preview: false,
    viewColumn: vscode.ViewColumn.Beside,
  });
  await vscode.languages.setTextDocumentLanguage(
    editor.document,
    indexInfo.data?.language ?? 'typescript',
  );
  const commandList = indexInfo.data.commandList ?? [];
  for (const command of commandList) {
    await vscode.commands.executeCommand(command);
  }
}

async function openView(requestParams: ViewRequestParams) {
  const index = setViewRequestMap(requestParams);
  await viewImpl(index);
}

function genViewLink(linkName: string, requestParams: ViewRequestParams) {
  const index = setViewRequestMap(requestParams);
  const args = [index];
  const encodedArgs = encodeURIComponent(JSON.stringify(args));
  const commandUrl = `command:${ViewCommandName}?${encodedArgs}`;
  const link = new vscode.MarkdownString(`[${linkName}](${commandUrl})`);
  link.isTrusted = true;
  return link;
}

function documentProviderImpl(uri: vscode.Uri) {
  const queryStr = uri.query;
  const query = new URLSearchParams(queryStr);
  const index = query.get('index');
  if (!index) {
    return '';
  }
  const indexInfo = ViewRequestMap.get(index);
  if (!indexInfo) {
    return '';
  }
  return String(indexInfo.data.text);
}

export function getViewService() {
  return {
    command: [ViewCommandName, viewImpl],
    documentProvider: [DocumentProviderName, documentProviderImpl],
    genViewLink,
    openView,
  } as const;
}
