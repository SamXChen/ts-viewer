import * as path from 'path';
import * as ts from 'typescript';

export function isPathInside(fileName: string, directory: string) {
  const relativePath = path.relative(directory, fileName);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

export function normalizeFsPath(fileName: string) {
  const normalized = path.normalize(fileName);
  return ts.sys.useCaseSensitiveFileNames ? normalized : normalized.toLowerCase();
}
