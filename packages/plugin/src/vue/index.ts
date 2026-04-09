import { server as tsServer } from 'typescript/lib/tsserverlibrary';
import ts from 'typescript';
import type { GetTypeRequest } from '@ts-viewer/shared';
import { findNode } from '../utils/syntax';
import { resolveTypeStringAtNode } from '../utils/type-resolve';

export interface ServiceLogger {
  info(message: string): void;
}

const AnyTypeString = 'any';

export function resolveVueTypeInfo(
  info: tsServer.PluginCreateInfo,
  request: GetTypeRequest,
  logger: ServiceLogger,
) {
  const languageService = info.project.getLanguageService();
  const program = languageService.getProgram();
  if (!program) {
    throw new Error('program not found');
  }

  const checker = program.getTypeChecker();

  const result =
    tryResolveFromDefinitions(languageService, program, checker, request, logger) ??
    tryResolveFromDirectLookup(program, checker, request, logger) ??
    tryResolveFromQuickInfo(languageService, request, logger);

  if (result) {
    return result;
  }

  throw new Error(
    'Vue type info not found. Make sure the Vue Official extension (Vue.volar) is installed and active.',
  );
}

function tryResolveFromDefinitions(
  languageService: ts.LanguageService,
  program: ts.Program,
  checker: ts.TypeChecker,
  request: GetTypeRequest,
  logger: ServiceLogger,
): string | undefined {
  const definitions = languageService.getDefinitionAtPosition(request.fileName, request.position);
  logger.info(`[ts-viewer:vue] definitions count=${definitions?.length ?? 0}`);

  if (!definitions || definitions.length === 0) {
    return undefined;
  }

  for (const def of definitions) {
    const defSourceFile = program.getSourceFile(def.fileName);
    if (!defSourceFile) {
      continue;
    }

    const defNode = findNode(defSourceFile, def.textSpan.start);
    if (!defNode) {
      continue;
    }

    const typeText = resolveTypeStringAtNode(checker, defNode);
    if (typeText && typeText !== AnyTypeString) {
      logger.info(`[ts-viewer:vue] definition type length: ${typeText.length}`);
      return typeText;
    }
  }

  return undefined;
}

function tryResolveFromDirectLookup(
  program: ts.Program,
  checker: ts.TypeChecker,
  request: GetTypeRequest,
  logger: ServiceLogger,
): string | undefined {
  const sourceFile = program.getSourceFile(request.fileName);
  if (!sourceFile) {
    return undefined;
  }

  const node = findNode(sourceFile, request.position);
  if (!node) {
    return undefined;
  }

  const typeText = resolveTypeStringAtNode(checker, node);
  if (typeText && typeText !== AnyTypeString) {
    logger.info(`[ts-viewer:vue] direct type length: ${typeText.length}`);
    return typeText;
  }

  return undefined;
}

function tryResolveFromQuickInfo(
  languageService: ts.LanguageService,
  request: GetTypeRequest,
  logger: ServiceLogger,
): string | undefined {
  const quickInfo = languageService.getQuickInfoAtPosition(request.fileName, request.position);
  if (!quickInfo) {
    return undefined;
  }

  logger.info(`[ts-viewer:vue] quickinfo fallback, kind=${quickInfo.kind ?? 'unknown'}`);
  return extractTypeFromDisplayParts(quickInfo.displayParts);
}

function extractTypeFromDisplayParts(displayParts: ts.SymbolDisplayPart[] | undefined) {
  if (!displayParts || displayParts.length === 0) {
    return undefined;
  }

  const fullText = displayParts.map((part) => part.text).join('');

  const colonIndex = fullText.indexOf(':');
  if (colonIndex >= 0) {
    const afterColon = fullText.substring(colonIndex + 1).trim();
    if (afterColon) {
      return afterColon;
    }
  }

  return fullText.trim() || undefined;
}
