import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

export interface UsageScenario {
  expectedIncludes: string[];
  file: string;
  fixture: string;
  kind?: 'vue-script-setup';
  name: string;
  symbol: string;
  tsconfig?: string;
}

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));

export const repoRoot = path.resolve(currentDirectory, '../../..');
export const fixturesRoot = path.join(repoRoot, 'tests', 'fixtures');
export const usageScenariosPath = path.join(fixturesRoot, 'usage-scenarios.json');

const TypeFormatFlags =
  ts.TypeFormatFlags.NoTruncation |
  ts.TypeFormatFlags.NoTypeReduction |
  ts.TypeFormatFlags.InTypeAlias;

export function loadUsageScenarios() {
  return readJson<UsageScenario[]>(usageScenariosPath);
}

export function runScenario(scenario: UsageScenario) {
  const fixtureRoot = path.join(fixturesRoot, scenario.fixture);
  const configPath = path.join(fixtureRoot, scenario.tsconfig ?? 'tsconfig.json');
  const config = loadTsConfig(configPath);

  if (scenario.kind === 'vue-script-setup') {
    return runVueScenario(scenario, fixtureRoot, config);
  }

  const filePath = path.join(fixtureRoot, scenario.file);
  const program = ts.createProgram({
    rootNames: config.fileNames,
    options: config.options,
  });

  return getTypeTextFromProgram(program, filePath, scenario.symbol);
}

export function readJson<T>(filePath: string): T {
  return JSON.parse(readText(filePath)) as T;
}

export function readText(filePath: string) {
  return fs.readFileSync(filePath, 'utf8');
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function runVueScenario(scenario: UsageScenario, fixtureRoot: string, config: ts.ParsedCommandLine) {
  const vueFilePath = path.join(fixtureRoot, scenario.file);
  const virtualFilePath = path.join(fixtureRoot, 'src', '__generated__', `${path.basename(scenario.file)}.ts`);
  const sourceText = readText(vueFilePath);
  const scriptSetupText = extractScriptSetup(sourceText, scenario.name);
  const virtualFileText = `${scriptSetupText}\nexport {};\n`;

  const host = ts.createCompilerHost(config.options);
  const originalFileExists = host.fileExists.bind(host);
  const originalReadFile = host.readFile.bind(host);
  const originalGetSourceFile = host.getSourceFile.bind(host);

  host.fileExists = (fileName) => {
    if (samePath(fileName, virtualFilePath)) {
      return true;
    }
    return originalFileExists(fileName);
  };
  host.readFile = (fileName) => {
    if (samePath(fileName, virtualFilePath)) {
      return virtualFileText;
    }
    return originalReadFile(fileName);
  };
  host.getSourceFile = (fileName, languageVersion, onError, shouldCreateNewSourceFile) => {
    if (samePath(fileName, virtualFilePath)) {
      return ts.createSourceFile(fileName, virtualFileText, languageVersion, true, ts.ScriptKind.TS);
    }
    return originalGetSourceFile(fileName, languageVersion, onError, shouldCreateNewSourceFile);
  };

  const program = ts.createProgram({
    rootNames: [...config.fileNames, virtualFilePath],
    options: config.options,
    host,
  });

  return getTypeTextFromProgram(program, virtualFilePath, scenario.symbol);
}

function getTypeTextFromProgram(program: ts.Program, filePath: string, symbolName: string) {
  const checker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(filePath);
  assert(sourceFile, `Source file not found in program: ${path.relative(repoRoot, filePath)}`);

  const targetNode = findIdentifier(sourceFile, symbolName);
  assert(targetNode, `Symbol not found in ${path.relative(repoRoot, filePath)}: ${symbolName}`);

  const type = checker.getTypeAtLocation(targetNode);
  const typeText = checker.typeToString(type, undefined, TypeFormatFlags);
  assert(typeText, `Type text was empty for ${symbolName}`);
  return typeText;
}

function findIdentifier(sourceFile: ts.SourceFile, symbolName: string) {
  let result: ts.Identifier | undefined;

  visit(sourceFile);
  return result;

  function visit(node: ts.Node) {
    if (result) {
      return;
    }

    if (ts.isIdentifier(node) && node.text === symbolName) {
      result = node;
      return;
    }

    ts.forEachChild(node, visit);
  }
}

function extractScriptSetup(sourceText: string, scenarioName: string) {
  const match = sourceText.match(/<script\s+setup(?:\s+lang="ts")?>([\s\S]*?)<\/script>/);
  assert(match?.[1], `Unable to extract <script setup> block for scenario ${scenarioName}`);
  return match[1].trim();
}

function loadTsConfig(configPath: string) {
  const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
  if (readResult.error) {
    throw new Error(formatDiagnostic(readResult.error));
  }

  const parsed = ts.parseJsonConfigFileContent(readResult.config, ts.sys, path.dirname(configPath));
  if (parsed.errors.length > 0) {
    throw new Error(parsed.errors.map(formatDiagnostic).join('\n'));
  }

  return parsed;
}

function formatDiagnostic(diagnostic: ts.Diagnostic) {
  return ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
}

function samePath(left: string, right: string) {
  return path.normalize(left) === path.normalize(right);
}