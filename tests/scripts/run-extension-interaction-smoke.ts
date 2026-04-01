import path from 'node:path';
import {
  assert,
  fixturesRoot,
  loadUsageScenarios,
  readJson,
  repoRoot,
  runScenario,
} from './lib/fixture-smoke';
import { requireTranspiledModuleGraph } from './lib/transpile-module';

interface InteractionScenario {
  expectEllipsis: boolean;
  expectedPreviewIncludes: string[];
  expectedTitle: string;
  name: string;
  symbolName: string;
  usageScenario: string;
}

interface TypeInfoPayload {
  preview: string;
  text: string;
  title: string;
}

interface TypeInfoModule {
  createTypeInfoPayload(typeString: string, symbolName: string): TypeInfoPayload;
  toViewRequest(payload: TypeInfoPayload): {
    commandList: string[];
    language: string;
    text: string;
    title: string;
  };
}

const interactionScenariosPath = path.join(fixturesRoot, 'interaction-scenarios.json');
const typeInfoSourcePath = path.join(repoRoot, 'packages', 'extension', 'src', 'type-info.ts');
const extensionSourceRoot = path.join(repoRoot, 'packages', 'extension', 'src');
const extensionTempRoot = path.join(repoRoot, 'packages', 'extension', '.tmp');

void main();

async function main() {
  const usageScenarios = new Map(loadUsageScenarios().map((scenario) => [scenario.name, scenario]));
  const interactionScenarios = readJson<InteractionScenario[]>(interactionScenariosPath);
  const typeInfoModule = await requireTranspiledModuleGraph<TypeInfoModule>({
    entrySourcePath: typeInfoSourcePath,
    sourcePaths: [typeInfoSourcePath],
    sourceRoot: extensionSourceRoot,
    tempRoot: extensionTempRoot,
  });

  for (const scenario of interactionScenarios) {
    const usageScenario = usageScenarios.get(scenario.usageScenario);
    assert(usageScenario, `Missing usage scenario for interaction scenario: ${scenario.name}`);

    const typeText = runScenario(usageScenario);
    const payload = typeInfoModule.createTypeInfoPayload(typeText, scenario.symbolName);
    const viewRequest = typeInfoModule.toViewRequest(payload);

    for (const expectedText of scenario.expectedPreviewIncludes) {
      assert(
        payload.preview.includes(expectedText),
        `Interaction scenario ${scenario.name} is missing preview text: ${expectedText}\nActual:\n${payload.preview}`,
      );
    }

    assert(
      payload.preview.includes('...') === scenario.expectEllipsis,
      `Interaction scenario ${scenario.name} ellipsis expectation failed. Preview:\n${payload.preview}`,
    );

    assert(
      payload.title === scenario.expectedTitle,
      `Interaction scenario ${scenario.name} title mismatch. Expected ${scenario.expectedTitle}, got ${payload.title}`,
    );
    assert(viewRequest.title === payload.title, `Interaction scenario ${scenario.name} view title mismatch`);
    assert(viewRequest.text === payload.text, `Interaction scenario ${scenario.name} view text mismatch`);
    assert(viewRequest.language === 'typescript', `Interaction scenario ${scenario.name} view language mismatch`);
    assert(
      Array.isArray(viewRequest.commandList) &&
        viewRequest.commandList.includes('editor.action.formatDocument'),
      `Interaction scenario ${scenario.name} missing format command`,
    );
  }

  console.log(`Extension interaction smoke passed for ${interactionScenarios.length} scenario(s).`);
}
