import ts from 'typescript';
import { findNode } from '../utils/syntax';
import { TypeFormatFlags } from '../utils/type-format';
import { collectVueScriptBlocks, type VueScriptBlock, type VueTypeRequest } from './script';
import { createVueCompilerHost, createVueVirtualFileContext, type VueVirtualFileContext } from './virtual-file';

export type {
  VueScriptBlock,
  VueTypeRequest,
  VueVirtualFileContext,
};
export { collectVueScriptBlocks, isScriptSetup } from './script';
export { createVueCompilerHost, createVueVirtualFileContext } from './virtual-file';

export function resolveVueTypeInfo(program: ts.Program, request: VueTypeRequest) {
  const sourceText = ts.sys.readFile(request.fileName);
  if (!sourceText) {
    throw new Error('Vue source file not found');
  }

  const scriptBlocks = collectVueScriptBlocks(sourceText);
  const context = createVueVirtualFileContext(
    request.fileName,
    scriptBlocks,
    request.position,
  );
  if (!context) {
    throw new Error('TS Viewer currently supports Vue script blocks only');
  }

  const compilerOptions = program.getCompilerOptions();
  const host = createVueCompilerHost(program, compilerOptions, context);
  const rootNames = Array.from(
    new Set([
      ...program.getRootFileNames().filter((fileName) => fileName !== request.fileName),
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
