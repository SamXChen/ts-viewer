import ts from 'typescript';

export interface VueTypeRequest {
  fileName: string;
  position: number;
}

export interface VueScriptBlock {
  attributes: string;
  blockType: 'script' | 'scriptSetup';
  content: string;
  contentEnd: number;
  contentStart: number;
  scriptKind: ts.ScriptKind;
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

export function combineScriptBlocks(blocks: VueScriptBlock[]) {
  let content = '';

  for (const block of blocks) {
    content += block.content;
    if (!block.content.endsWith('\n')) {
      content += '\n';
    }
  }

  return content;
}

export function getCombinedScriptKind(blocks: VueScriptBlock[]) {
  if (blocks.some((block) => block.scriptKind === ts.ScriptKind.TSX)) {
    return ts.ScriptKind.TSX;
  }
  if (blocks.some((block) => block.scriptKind === ts.ScriptKind.JSX)) {
    return ts.ScriptKind.JSX;
  }
  if (blocks.some((block) => block.scriptKind === ts.ScriptKind.JS)) {
    return ts.ScriptKind.JS;
  }

  return ts.ScriptKind.TS;
}

export function getScriptKind(attributes: string) {
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

export function isScriptSetup(attributes: string) {
  return /\bsetup\b/i.test(attributes);
}
