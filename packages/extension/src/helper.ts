import * as vscode from 'vscode';

const CopyExpandTypeScriptCommandName = 'ts-viewer.copy-expand-typescript';

export function getExpandTypeScriptService() {
  return {
    command: [CopyExpandTypeScriptCommandName, copyExpandTypeScriptImpl],
    getExpandTypeScriptLink,
  } as const;
}

function copyExpandTypeScriptImpl() {
  vscode.env.clipboard.writeText(getExpandTypeScript());
  vscode.window.showInformationMessage('[Ts-Viewer-Extension] Copied expand typescript.');
}

function getExpandTypeScriptLink() {
  const link = new vscode.MarkdownString(
    `[Get Expand Helper](command:${CopyExpandTypeScriptCommandName})`,
  );
  link.isTrusted = true;
  return link;
}

function getExpandTypeScript() {
  return `type ExpandRecursively<T> = T extends Date | RegExp | bigint | symbol | null | undefined | Function ? T : T extends Map<infer K, infer V> ? Map<ExpandRecursively<K>, ExpandRecursively<V>> : T extends WeakMap<infer K, infer V> ? WeakMap<ExpandRecursively<K>, ExpandRecursively<V>> : T extends Set<infer U> ? Set<ExpandRecursively<U>> : T extends WeakSet<infer U> ? WeakSet<ExpandRecursively<U>> : T extends Array<infer E> ? Array<ExpandRecursively<E>> : T extends object ? { [K in keyof T]: ExpandRecursively<T[K]> } : T;`;
}
