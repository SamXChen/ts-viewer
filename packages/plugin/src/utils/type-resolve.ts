import type ts from 'typescript';
import { TypeFormatFlags } from './type-format';

export function resolveTypeStringAtNode(
  checker: ts.TypeChecker,
  node: ts.Node,
): string | undefined {
  const type = checker.getTypeAtLocation(node);
  const text = checker.typeToString(type, undefined, TypeFormatFlags);
  return text || undefined;
}
