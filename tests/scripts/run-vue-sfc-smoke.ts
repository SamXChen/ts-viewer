import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { assert, fixturesRoot, readJson, repoRoot } from './lib/fixture-smoke';
import { pluginSourceRoot, pluginUtilitySourcePaths, vueSourcePath } from './lib/plugin-runtime';
import { requireTranspiledModuleGraph } from './lib/transpile-module';

interface VueScenario {
  expectedIncludes: string[];
  file: string;
  name: string;
  searchText: string;
}

interface VueMappingModule {
  resolveVueTypeInfo(program: ts.Program, request: { fileName: string; position: number }): string;
}

const scenariosPath = path.join(fixturesRoot, 'vue-sfc-scenarios.json');

void main();

async function main() {
  const scenarios = readJson<VueScenario[]>(scenariosPath);
  const vueMappingModule = await loadVueMappingModule();
  const fixtureRoot = path.join(fixturesRoot, 'vue-workspace');
  const configPath = path.join(fixtureRoot, 'tsconfig.json');
  const program = createProgram(configPath);

  for (const scenario of scenarios) {
    const filePath = path.join(fixtureRoot, scenario.file);
    const sourceText = fs.readFileSync(filePath, 'utf8');
    const searchIndex = sourceText.indexOf(scenario.searchText);
    assert(searchIndex >= 0, `Unable to find search text for scenario ${scenario.name}`);

    const typeText = vueMappingModule.resolveVueTypeInfo(program, {
      fileName: filePath,
      position: searchIndex,
    });

    for (const expectedText of scenario.expectedIncludes) {
      assert(
        typeText.includes(expectedText),
        `Vue SFC scenario ${scenario.name} is missing text: ${expectedText}\nActual:\n${typeText}`,
      );
    }
  }

  console.log(`Vue SFC smoke passed for ${scenarios.length} scenario(s).`);
}

async function loadVueMappingModule() {
  return requireTranspiledModuleGraph<VueMappingModule>({
    entrySourcePath: vueSourcePath,
    sourcePaths: [vueSourcePath, ...pluginUtilitySourcePaths],
    sourceRoot: pluginSourceRoot,
    tempRoot: path.join(repoRoot, 'packages', 'plugin', '.tmp'),
  });
}

function createProgram(configPath: string) {
  const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
  if (readResult.error) {
    throw new Error(ts.flattenDiagnosticMessageText(readResult.error.messageText, '\n'));
  }

  const parsed = ts.parseJsonConfigFileContent(readResult.config, ts.sys, path.dirname(configPath));
  if (parsed.errors.length > 0) {
    throw new Error(
      parsed.errors.map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n')).join('\n'),
    );
  }

  return ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
  });
}