import type ts from 'typescript';

export function findNode(node: ts.Node, position: number): ts.Node | undefined {
  if (node.pos > position || node.end < position) {
    return undefined;
  }

  let childMatch: ts.Node | undefined;
  node.forEachChild((child) => {
    if (childMatch) {
      return;
    }

    if (child.pos > position || child.end < position) {
      return;
    }

    childMatch = findNode(child, position) ?? child;
  });

  return childMatch ?? node;
}