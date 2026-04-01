import { server as tsServer } from 'typescript/lib/tsserverlibrary';
import * as ts from 'typescript';
import type { GetTypeRequest } from '@ts-viewer/shared';
import { findNode } from '../utils/syntax';
import { TypeFormatFlags } from '../utils/type-format';

export interface ServiceLogger {
  info(message: string): void;
}

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

  const definitions = languageService.getDefinitionAtPosition(request.fileName, request.position);
  logger.info(`[TS-Viewer][Vue-Definitions] count=${definitions?.length ?? 0}`);

  if (definitions && definitions.length > 0) {
    for (const def of definitions) {
      const defSourceFile = program.getSourceFile(def.fileName);
      if (!defSourceFile) {
        continue;
      }

      const defNode = findNode(defSourceFile, def.textSpan.start);
      if (!defNode) {
        continue;
      }

      const checker = program.getTypeChecker();
      const type = checker.getTypeAtLocation(defNode);
      const typeText = checker.typeToString(type, undefined, TypeFormatFlags);
      if (typeText && typeText !== 'any') {
        logger.info(`[TS-Viewer][Vue-Definition-Type] ${typeText.length}`);
        return typeText;
      }
    }
  }

  const sourceFile = program.getSourceFile(request.fileName);
  if (sourceFile) {
    const node = findNode(sourceFile, request.position);
    if (node) {
      const checker = program.getTypeChecker();
      const type = checker.getTypeAtLocation(node);
      const typeText = checker.typeToString(type, undefined, TypeFormatFlags);
      if (typeText && typeText !== 'any') {
        logger.info(`[TS-Viewer][Vue-Direct-Type] ${typeText.length}`);
        return typeText;
      }
    }
  }

  const quickInfo = languageService.getQuickInfoAtPosition(request.fileName, request.position);
  if (quickInfo) {
    logger.info(`[TS-Viewer][Vue-QuickInfo-Fallback] kind=${quickInfo.kind ?? 'unknown'}`);
    const typeInfoString = extractTypeFromDisplayParts(quickInfo.displayParts);
    if (typeInfoString) {
      return typeInfoString;
    }
  }

  throw new Error(
    'Vue type info not found. Make sure the Vue Official extension (Vue.volar) is installed and active.',
  );
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
