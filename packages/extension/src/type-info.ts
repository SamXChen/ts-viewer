import { format as formatWithPrettier } from 'prettier/standalone';
import * as prettierPluginEstree from 'prettier/plugins/estree';
import * as prettierPluginTypeScript from 'prettier/plugins/typescript';

export interface TypeInfoPayload {
  readonly preview: string;
  readonly text: string;
  readonly title: string;
}

const PreviewMaxLines = 4;
const PreviewMaxChars = 600;
const Ellipsis = '...';
const EllipsisLength = Ellipsis.length;
const ViewLanguage = 'typescript';
const FormatDocumentCommand = 'editor.action.formatDocument';

export async function createTypeInfoPayload(
  typeString: string,
  symbolName: string,
): Promise<TypeInfoPayload> {
  const validTypeString = ensureTypeStringValid(typeString, symbolName);
  const formattedTypeString = await formatTypeString(validTypeString);

  return {
    preview: createPreview(formattedTypeString),
    text: formattedTypeString,
    title: `ts-viewer.full-type.${symbolName}.d.ts`,
  };
}

function createPreview(typeString: string) {
  const lines = typeString.trimEnd().split('\n');
  const preview = lines.slice(0, PreviewMaxLines).join('\n');
  const maybeTruncatedLines = lines.length > PreviewMaxLines ? `${preview}\n${Ellipsis}` : preview;

  if (maybeTruncatedLines.length <= PreviewMaxChars) {
    return maybeTruncatedLines;
  }

  return `${maybeTruncatedLines.slice(0, PreviewMaxChars - EllipsisLength)}${Ellipsis}`;
}

export function toViewRequest(typeInfo: TypeInfoPayload) {
  return {
    title: typeInfo.title,
    text: typeInfo.text,
    language: ViewLanguage,
    commandList: [FormatDocumentCommand],
  };
}

async function formatTypeString(typeString: string) {
  try {
    return await formatWithPrettier(typeString, {
      parser: 'typescript',
      plugins: [prettierPluginEstree, prettierPluginTypeScript],
    });
  } catch {
    // 格式化失败时回退原始类型字符串（prettier 对残缺类型片段可能报错）
    return typeString;
  }
}

const ValidTypeStringPrefixes = ['type', 'interface', 'enum', 'declare', 'export'];

function ensureTypeStringValid(input: string, currentWord: string): string {
  if (!input) {
    return '';
  }
  if (ValidTypeStringPrefixes.some((prefix) => input.startsWith(prefix))) {
    return input;
  }
  return `type ${currentWord} = ${input}`;
}
