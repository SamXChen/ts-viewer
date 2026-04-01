import ts from 'typescript';
import { normalizeFsPath } from './utils/path';
import { findNode } from './utils/syntax';
import { TypeFormatFlags } from './utils/type-format';

export interface VueTypeRequest {
  fileName: string;
  position: number;
}

export interface VueVirtualFileContext {
  blockType: 'script' | 'scriptSetup';
  content: string;
  scriptKind: ts.ScriptKind;
  virtualFileName: string;
  virtualPosition: number;
}

interface VueScriptBlock {
  attributes: string;
  blockType: 'script' | 'scriptSetup';
  content: string;
  contentEnd: number;
  contentStart: number;
  scriptKind: ts.ScriptKind;
}

export function resolveVueTypeInfo(program: ts.Program, request: VueTypeRequest) {
  const sourceText = ts.sys.readFile(request.fileName);
  if (!sourceText) {
    throw new Error('Vue source file not found');
  }

  const context = createVueVirtualFileContext(request.fileName, sourceText, request.position);
  if (!context) {
    throw new Error('TS Viewer currently supports Vue script blocks only');
  }

  const compilerOptions = program.getCompilerOptions();
  const host = createVueCompilerHost(program, compilerOptions, context);
  const rootNames = Array.from(
    new Set([
      ...program
        .getRootFileNames()
        .filter((fileName) => normalizeFsPath(fileName) !== normalizeFsPath(request.fileName)),
      context.virtualFileName,
    ]),
  );

  const virtualProgram = ts.createProgram({
    rootNames,
    options: compilerOptions,
    host,
  });

  const sourceFile = virtualProgram.getSourceFile(context.virtualFileName);
  if (!sourceFile) {
    throw new Error('Vue virtual source file not found');
  }

  const checker = virtualProgram.getTypeChecker();
  const node = findNode(sourceFile, context.virtualPosition);
  if (!node) {
    throw new Error('Vue node not found');
  }

  const type = checker.getTypeAtLocation(node);
  const typeInfoString = checker.typeToString(type, undefined, TypeFormatFlags);
  if (!typeInfoString) {
    throw new Error('Vue type info not found');
  }

  return typeInfoString;
}

export function createVueVirtualFileContext(
  fileName: string,
  sourceText: string,
  requestPosition: number,
): VueVirtualFileContext | undefined {
  const matchingBlock = collectVueScriptBlocks(sourceText).find(
    (block) => requestPosition >= block.contentStart && requestPosition <= block.contentEnd,
  );

  if (!matchingBlock) {
    return undefined;
  }

  return {
    blockType: matchingBlock.blockType,
    content: matchingBlock.content,
    scriptKind: matchingBlock.scriptKind,
    virtualFileName: createVirtualFileName(fileName, matchingBlock),
    virtualPosition: requestPosition - matchingBlock.contentStart,
  };
}

export function collectVueScriptBlocks(sourceText: string) {
  const blocks: VueScriptBlock[] = [];
  const scriptTagPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

  for (const match of sourceText.matchAll(scriptTagPattern)) {
    const fullMatch = match[0];
    const attributes = match[1] ?? '';
    const content = match[2] ?? '';
    const start = match.index ?? 0;
    const tagEndOffset = fullMatch.indexOf('>') + 1;
    const contentStart = start + tagEndOffset;
    const contentEnd = start + fullMatch.lastIndexOf('</script>');
    const scriptKind = getScriptKind(attributes);

    if (!scriptKind) {
      continue;
    }

    blocks.push({
      attributes,
      blockType: isScriptSetup(attributes) ? 'scriptSetup' : 'script',
      content,
      contentEnd,
      contentStart,
      scriptKind,
    });
  }

  return blocks;
}

function createVueCompilerHost(
  program: ts.Program,
  compilerOptions: ts.CompilerOptions,
  context: VueVirtualFileContext,
) {
  const host = ts.createCompilerHost(compilerOptions);
  const originalFileExists = host.fileExists.bind(host);
  const originalReadFile = host.readFile.bind(host);
  const originalGetSourceFile = host.getSourceFile.bind(host);
  const originalGetDefaultLibFileName = host.getDefaultLibFileName.bind(host);

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
  host.getDefaultLibFileName = (options) => {
    return originalGetDefaultLibFileName(options);
  };

  return host;
}

function createVirtualFileName(fileName: string, block: VueScriptBlock) {
  const extension = getVirtualExtension(block.scriptKind);
  return `${fileName}.${block.blockType}.${extension}`;
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

function getScriptKind(attributes: string) {
  const langMatch = attributes.match(/\blang\s*=\s*["']([^"']+)["']/i);
  const lang = langMatch?.[1]?.toLowerCase();

  if (!lang || lang === 'ts') {
    return ts.ScriptKind.TS;
  }
  if (lang === 'tsx') {
    return ts.ScriptKind.TSX;
  }
  if (lang === 'js' || lang === 'javascript') {
    return ts.ScriptKind.JS;
  }
  if (lang === 'jsx') {
    return ts.ScriptKind.JSX;
  }

  return undefined;
}

function isScriptSetup(attributes: string) {
  return /\bsetup\b/i.test(attributes);
}
