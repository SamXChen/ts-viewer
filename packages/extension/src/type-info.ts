export interface TypeInfoPayload {
  preview: string;
  text: string;
  title: string;
}

const PreviewMaxLines = 8;
const PreviewMaxChars = 600;

export function createTypeInfoPayload(typeString: string, symbolName: string): TypeInfoPayload {
  const validTypeString = ensureTypeStringValid(typeString, symbolName);

  return {
    preview: createPreview(validTypeString),
    text: validTypeString,
    title: `ts-viewer.full-type.${symbolName}.d.ts`,
  };
}

export function createPreview(typeString: string) {
  const lines = typeString.split('\n');
  const preview = lines.slice(0, PreviewMaxLines).join('\n');
  const maybeTruncatedLines = lines.length > PreviewMaxLines ? `${preview}\n...` : preview;

  if (maybeTruncatedLines.length <= PreviewMaxChars) {
    return maybeTruncatedLines;
  }

  return `${maybeTruncatedLines.slice(0, PreviewMaxChars - 3)}...`;
}

export function toViewRequest(typeInfo: TypeInfoPayload) {
  return {
    title: typeInfo.title,
    text: typeInfo.text,
    language: 'typescript',
    commandList: ['editor.action.formatDocument'],
  };
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
