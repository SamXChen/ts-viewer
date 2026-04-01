import ts from 'typescript';
import { normalizeFsPath } from '../utils/path';
import type { VueScriptBlock } from './script';
import { combineScriptBlocks, getCombinedScriptKind } from './script';

export interface VueVirtualFileContext {
  content: string;
  scriptKind: ts.ScriptKind;
  virtualFileName: string;
  virtualPosition: number;
}

export function createVueVirtualFileContext(
  fileName: string,
  scriptBlocks: VueScriptBlock[],
  requestPosition: number,
): VueVirtualFileContext | undefined {
  const matchingScriptOffset = resolveScriptOffset(scriptBlocks, requestPosition);

  if (matchingScriptOffset === undefined) {
    return undefined;
  }

  let content = combineScriptBlocks(scriptBlocks);
  if (content && !content.endsWith('\n')) {
    content += '\n';
  }

  content += 'export {};\n';

  const blockType = getMatchingBlockType(scriptBlocks, requestPosition);
  const scriptKind = getCombinedScriptKind(scriptBlocks);

  return {
    content,
    scriptKind,
    virtualFileName: createVirtualFileName(fileName, blockType, scriptKind),
    virtualPosition: matchingScriptOffset,
  };
}

export function createVueCompilerHost(
  program: ts.Program,
  compilerOptions: ts.CompilerOptions,
  context: VueVirtualFileContext,
) {
  const host = ts.createCompilerHost(compilerOptions);
  const originalFileExists = host.fileExists.bind(host);
  const originalReadFile = host.readFile.bind(host);
  const originalGetSourceFile = host.getSourceFile.bind(host);

  host.fileExists = (fileName) => {
    if (normalizeFsPath(fileName) === normalizeFsPath(context.virtualFileName)) {
      return true;
    }
    return originalFileExists(fileName);
  };
  host.readFile = (fileName) => {
    if (normalizeFsPath(fileName) === normalizeFsPath(context.virtualFileName)) {
      return context.content;
    }
    return originalReadFile(fileName);
  };
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (normalizeFsPath(fileName) === normalizeFsPath(context.virtualFileName)) {
      return ts.createSourceFile(
        fileName,
        context.content,
        languageVersion,
        true,
        context.scriptKind,
      );
    }

    const existingSourceFile = program.getSourceFile(fileName);
    if (existingSourceFile && !shouldCreateNewSourceFile) {
      return existingSourceFile;
    }

    return originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  };

  return host;
}

function resolveScriptOffset(scriptBlocks: VueScriptBlock[], requestPosition: number) {
  let combinedOffset = 0;

  for (const block of scriptBlocks) {
    if (isPositionInRange(requestPosition, block.contentStart, block.contentEnd)) {
      return combinedOffset + (requestPosition - block.contentStart);
    }

    combinedOffset += block.content.length;
    if (!block.content.endsWith('\n')) {
      combinedOffset += 1;
    }
  }

  return undefined;
}

function createVirtualFileName(
  fileName: string,
  blockType: VueScriptBlock['blockType'],
  scriptKind: ts.ScriptKind,
) {
  const extension = getVirtualExtension(scriptKind);
  return `${fileName}.${blockType}.${extension}`;
}

function getMatchingBlockType(scriptBlocks: VueScriptBlock[], requestPosition: number): VueScriptBlock['blockType'] {
  return scriptBlocks.find((block) => isPositionInRange(requestPosition, block.contentStart, block.contentEnd))?.blockType ?? 'script';
}

function getVirtualExtension(scriptKind: ts.ScriptKind) {
  switch (scriptKind) {
    case ts.ScriptKind.TSX:
      return 'tsx';
    case ts.ScriptKind.JSX:
      return 'jsx';
    case ts.ScriptKind.JS:
      return 'js';
    default:
      return 'ts';
  }
}

function isPositionInRange(position: number, start: number, end: number) {
  return position >= start && position < end;
}
