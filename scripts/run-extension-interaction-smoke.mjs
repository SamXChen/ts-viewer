import fs from 'fs';
import path from 'path';
import ts from 'typescript';
import {
  assert,
  fixturesRoot,
  loadUsageScenarios,
  readJson,
  repoRoot,
  runScenario,
} from './lib/fixture-smoke.mjs';

const interactionScenariosPath = path.join(fixturesRoot, 'interaction-scenarios.json');
const typeInfoSourcePath = path.join(repoRoot, 'packages', 'extension', 'src', 'type-info.ts');

await main();

async function main() {
  const usageScenarios = new Map(loadUsageScenarios().map((scenario) => [scenario.name, scenario]));
  const interactionScenarios = readJson(interactionScenariosPath);
  const typeInfoModule = await loadTypeInfoModule();

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

async function loadTypeInfoModule() {
  const source = fs.readFileSync(typeInfoSourcePath, 'utf8');
  const transpiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ES2020,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: typeInfoSourcePath,
  }).outputText;

  const encodedModule = Buffer.from(transpiled, 'utf8').toString('base64');
  return import(`data:text/javascript;base64,${encodedModule}`);
}
