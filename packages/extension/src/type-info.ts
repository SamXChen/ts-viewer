import prettier from 'prettier';

export interface TypeInfoPayload {
  preview: string;
  text: string;
  title: string;
}

const PreviewMaxLines = 4;
const PreviewMaxChars = 600;
const Ellipsis = '...';
const EllipsisLength = Ellipsis.length;
const ViewLanguage = 'typescript';
const FormatDocumentCommand = 'editor.action.formatDocument';

export function createTypeInfoPayload(typeString: string, symbolName: string): TypeInfoPayload {
  const validTypeString = ensureTypeStringValid(typeString, symbolName);
  const formattedTypeString = formatTypeString(validTypeString);

  return {
    preview: createPreview(formattedTypeString),
    text: formattedTypeString,
    title: `ts-viewer.full-type.${symbolName}.d.ts`,
  };
}

export function createPreview(typeString: string) {
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

function formatTypeString(typeString: string) {
  try {
    return prettier.format(typeString, {
      parser: 'typescript',
    });
  } catch {
    return typeString;
  }
}

export function ensureTypeStringValid(input: string, currentWord: string): string {
  if (!input) {
    return '';
  }
  if (input.startsWith('type')) {
    return input;
  }
  if (input.startsWith('interface')) {
    return input;
  }
  if (input.startsWith('enum')) {
    return input;
  }
  if (input.startsWith('declare')) {
    return input;
  }
  if (input.startsWith('export')) {
    return input;
  }
  return `type ${currentWord} = ${input}`;
}
