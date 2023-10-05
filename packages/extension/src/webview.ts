import * as vscode from 'vscode';

const ViewCommandName = 'ts-faker.view';

const MaxViewRequestMapSize = 6;
const ViewRequestMap = new Map<
  string,
  {
    createTime: number;
    data: any;
  }
>();

function setViewRequestMap(requestParams: any) {
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

function viewImpl(index: string) {
  const indexInfo = ViewRequestMap.get(index);
  if (!indexInfo) {
    return;
  }
  const data = indexInfo.data ?? {};
  const panel = vscode.window.createWebviewPanel(
    index,
    data.title ?? 'ts-faker.view',
    vscode.ViewColumn.Two,
    { enableScripts: true },
  );

  panel.webview.html = `
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>${data.title ?? 'ts-faker'}</title>
        ${
          (data.extensionLinkList as vscode.Uri[] | undefined)
            ?.map(
              (link) =>
                `<link rel="stylesheet" href="${panel.webview.asWebviewUri(link).toString()}">`,
            )
            .join('\n') ?? ''
        }
        <style>
          ${data.inlineStyleList?.join('\n') ?? ''}
        </style>
      </head>
      <body>${data.body ?? 'ts-faker'}</body>
    </html>
  `;
}

function genViewLink(linkName: string, requestParams: any) {
  const index = setViewRequestMap(requestParams);
  const args = [index];
  const encodedArgs = encodeURIComponent(JSON.stringify(args));
  const commandUrl = `command:${ViewCommandName}?${encodedArgs}`;
  const link = new vscode.MarkdownString(`[${linkName}](${commandUrl})`);
  link.isTrusted = true;
  return link;
}

export function getViewService() {
  return {
    command: [ViewCommandName, viewImpl],
    genViewLink,
  } as const;
}
