import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import ts from 'typescript';

interface RequireTranspiledModuleGraphOptions {
  entrySourcePath: string;
  sourcePaths: string[];
  sourceRoot: string;
  tempRoot: string;
}

export async function importInlineTranspiledModule<TModule>(sourcePath: string) {
  const transpiled = transpileSource(sourcePath, {
    module: ts.ModuleKind.ES2020,
    target: ts.ScriptTarget.ES2020,
  });
  const encodedModule = Buffer.from(transpiled, 'utf8').toString('base64');
  return import(`data:text/javascript;base64,${encodedModule}`) as Promise<TModule>;
}

export async function requireTranspiledModuleGraph<TModule>(
  options: RequireTranspiledModuleGraphOptions,
) {
  fs.mkdirSync(options.tempRoot, { recursive: true });
  const tempDirectory = fs.mkdtempSync(path.join(options.tempRoot, 'ts-viewer-smoke-'));

  try {
    for (const sourcePath of options.sourcePaths) {
      writeTranspiledFile(sourcePath, options.sourceRoot, tempDirectory);
    }

    const entryOutputPath = toOutputPath(
      options.entrySourcePath,
      options.sourceRoot,
      tempDirectory,
    );
    const requireFromTemp = createRequire(entryOutputPath);
    return requireFromTemp(entryOutputPath) as TModule;
  } finally {
    fs.rmSync(tempDirectory, { recursive: true, force: true });
  }
}

function writeTranspiledFile(sourcePath: string, sourceRoot: string, tempDirectory: string) {
  const outputPath = toOutputPath(sourcePath, sourceRoot, tempDirectory);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(
    outputPath,
    transpileSource(sourcePath, {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    }),
    'utf8',
  );
}

function toOutputPath(sourcePath: string, sourceRoot: string, tempDirectory: string) {
  const relativePath = path.relative(sourceRoot, sourcePath);
  return path.join(tempDirectory, relativePath.replace(/\.ts$/, '.js'));
}

function transpileSource(sourcePath: string, compilerOptions: ts.CompilerOptions) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  return ts.transpileModule(source, {
    compilerOptions,
    fileName: sourcePath,
  }).outputText;
}
