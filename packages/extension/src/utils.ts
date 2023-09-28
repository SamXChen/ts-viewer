import type * as vscode from 'vscode';

export function runWithCancelToken<T>(token: vscode.CancellationToken, cb: () => Promise<T>) {
  const cancelPromise = new Promise<never>((_, reject) => {
    token.onCancellationRequested(reject);
  });

  return Promise.race([cancelPromise, cb()]);
}
