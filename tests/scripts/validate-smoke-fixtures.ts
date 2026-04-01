import fs from 'node:fs';
import path from 'node:path';
import {
  assert,
  fixturesRoot,
  readJson,
  readText,
  repoRoot,
} from './lib/fixture-smoke';
import { pluginVueSourcePaths, serviceSourcePath } from './lib/plugin-runtime';

interface ExpectedFixture {
  files: string[];
  name: string;
  snippets: Array<[relativeFile: string, snippet: string]>;
}

interface UsageScenarioShape {
  expectedIncludes?: string[];
  fixture?: string;
  name?: string;
  symbol?: string;
}

interface InteractionScenarioShape {
  expectEllipsis?: boolean;
  expectedPreviewIncludes?: string[];
  name?: string;
  symbolName?: string;
  usageScenario?: string;
}

interface VueScenarioShape {
  expectedIncludes?: string[];
  file?: string;
  name?: string;
  positionOffset?: number;
  searchText?: string;
  symbolName?: string;
}

interface StabilityScenarioShape {
  expectedIncludes?: string[];
  file?: string;
  fixture?: string;
  name?: string;
  searchText?: string;
}

const extensionManifestPath = path.join(repoRoot, 'packages', 'extension', 'package.json');
const selectorsPath = path.join(repoRoot, 'packages', 'extension', 'src', 'constants.ts');
const extensionIndexPath = path.join(repoRoot, 'packages', 'extension', 'src', 'index.ts');
const codePath = path.join(repoRoot, 'packages', 'extension', 'src', 'code.ts');
const connectionPath = path.join(repoRoot, 'packages', 'extension', 'src', 'connection.ts');
const servicePath = serviceSourcePath;
const scenariosPath = path.join(fixturesRoot, 'usage-scenarios.json');
const interactionScenariosPath = path.join(fixturesRoot, 'interaction-scenarios.json');
const vueScenariosPath = path.join(fixturesRoot, 'vue-sfc-scenarios.json');
const stabilityScenariosPath = path.join(fixturesRoot, 'stability-scenarios.json');
const typeInfoPath = path.join(repoRoot, 'packages', 'extension', 'src', 'type-info.ts');
const vueMappingPaths = pluginVueSourcePaths;

const expectedFixtures: ExpectedFixture[] = [
  {
    name: 'typescript-workspace',
    files: ['tsconfig.json', 'src/index.ts'],
    snippets: [['src/index.ts', 'export type ExpandedUser = User']],
  },
  {
    name: 'javascript-workspace',
    files: ['tsconfig.json', 'src/index.js'],
    snippets: [['src/index.js', '@typedef {Object} ViewerUser']],
  },
  {
    name: 'tsx-workspace',
    files: ['tsconfig.json', 'src/app.tsx', 'src/jsx.d.ts'],
    snippets: [['src/app.tsx', 'export const panel = <section role="region">']],
  },
  {
    name: 'vue-workspace',
    files: ['tsconfig.json', 'src/App.vue', 'src/DualScript.vue', 'src/models.ts', 'src/vue-shim.d.ts'],
    snippets: [['src/App.vue', 'const props = defineProps<Props>()']],
  },
];

main();

function main() {
  const manifest = readJson<{ activationEvents?: string[] }>(extensionManifestPath);
  const selectorsSource = readText(selectorsPath);
  const extensionIndexSource = readText(extensionIndexPath);
  const codeSource = readText(codePath);
  const connectionSource = readText(connectionPath);
  const serviceSource = readText(servicePath);
  const typeInfoSource = readText(typeInfoPath);
  const vueMappingSource = vueMappingPaths.map((filePath) => readText(filePath)).join('\n');

  validateManifest(manifest);
  validateSelectors(selectorsSource);
  validateHoverRegistration(extensionIndexSource);
  validateHoverGuard(codeSource);
  validateConnectionSource(connectionSource);
  validateServiceSource(serviceSource);
  validateTypeInfoSource(typeInfoSource);
  validateVueMappingSource(vueMappingSource);
  validateStabilityHooks(serviceSource);
  validateFixtures();
  validateUsageScenarios();
  validateInteractionScenarios();
  validateVueScenarios();
  validateStabilityScenarios();

  console.log('Smoke fixture validation passed.');
}

function validateManifest(manifest: { activationEvents?: string[] }) {
  const activationEvents = manifest.activationEvents ?? [];
  const requiredEvents = [
    'workspaceContains:tsconfig.json',
    'onLanguage:typescript',
    'onLanguage:typescriptreact',
    'onLanguage:javascript',
    'onLanguage:javascriptreact',
    'onLanguage:vue',
  ];

  for (const event of requiredEvents) {
    assert(activationEvents.includes(event), `Missing activation event: ${event}`);
  }
}

function validateSelectors(source: string) {
  for (const selector of ['typescript', 'typescriptreact', 'javascript', 'javascriptreact', 'vue']) {
    assert(source.includes(`'${selector}'`), `Missing selector: ${selector}`);
  }

  assert(source.includes('hoverSelectors'), 'Missing hoverSelectors export');
  assert(source.includes('probeSelectors'), 'Missing probeSelectors export');
}

function validateHoverRegistration(source: string) {
  assert(source.includes('registerHoverProvider(hoverSelectors'), 'Hover provider should use hoverSelectors');
}

function validateHoverGuard(source: string) {
  for (const snippet of ['shouldSkipHoverDocument', "document.uri.scheme !== 'file'", "document.uri.scheme !== 'untitled'", "includes('.vue.')"]) {
    assert(source.includes(snippet), `Hover guard missing snippet: ${snippet}`);
  }
}

function validateConnectionSource(source: string) {
  for (const snippet of [
    'waitForHealthy',
    'probeForSupportedDocument',
    'workspace folders changed',
    'supported document opened',
    'existing port',
    'probeSelectors.includes',
  ]) {
    assert(source.includes(snippet), `Connection smoke guard missing snippet: ${snippet}`);
  }

  assert(!source.includes("ensureConnected('activate')"), 'Connection should be lazy and not auto-connect on activate');
}

function validateServiceSource(source: string) {
  for (const snippet of [
    'PluginHealthRoutePath',
    'PluginGetTypeRoutePath',
    'PluginLoopbackHost',
    'pruneCreatedInfoMap',
    'getDirectSourceFileMatch',
    'normalizeFsPath',
    'clearTypeInfoCache',
  ]) {
    assert(source.includes(snippet), `Plugin service smoke guard missing snippet: ${snippet}`);
  }
}

function validateTypeInfoSource(source: string) {
  for (const snippet of ['createTypeInfoPayload', 'createPreview', 'toViewRequest', 'PreviewMaxLines']) {
    assert(source.includes(snippet), `Type-info smoke guard missing snippet: ${snippet}`);
  }
}

function validateVueMappingSource(source: string) {
  for (const snippet of [
    'resolveVueTypeInfo',
    'createVueVirtualFileContext',
    'collectVueScriptBlocks',
    'isScriptSetup',
  ]) {
    assert(source.includes(snippet), `Vue mapping smoke guard missing snippet: ${snippet}`);
  }
}

function validateFixtures() {
  for (const fixture of expectedFixtures) {
    const fixtureRoot = path.join(fixturesRoot, fixture.name);
    assert(readablePathExists(fixtureRoot), `Missing fixture directory: ${fixture.name}`);

    for (const relativeFile of fixture.files) {
      const absoluteFile = path.join(fixtureRoot, relativeFile);
      assert(readablePathExists(absoluteFile), `Missing fixture file: ${fixture.name}/${relativeFile}`);
    }

    for (const [relativeFile, snippet] of fixture.snippets) {
      const absoluteFile = path.join(fixtureRoot, relativeFile);
      const source = readText(absoluteFile);
      assert(
        source.includes(snippet),
        `Fixture snippet not found in ${fixture.name}/${relativeFile}: ${snippet}`,
      );
    }
  }
}

function validateUsageScenarios() {
  const scenarios = readJson<UsageScenarioShape[]>(scenariosPath);
  assert(Array.isArray(scenarios), 'Usage scenarios file must contain an array');

  for (const scenario of scenarios) {
    assert(typeof scenario.name === 'string', 'Usage scenario is missing a name');
    assert(typeof scenario.fixture === 'string', `Usage scenario ${scenario.name} is missing a fixture`);
    assert(typeof scenario.symbol === 'string', `Usage scenario ${scenario.name} is missing a symbol`);
    assert(
      Array.isArray(scenario.expectedIncludes) && scenario.expectedIncludes.length > 0,
      `Usage scenario ${scenario.name} must define expectedIncludes`,
    );
  }
}

function validateInteractionScenarios() {
  const scenarios = readJson<InteractionScenarioShape[]>(interactionScenariosPath);
  assert(Array.isArray(scenarios), 'Interaction scenarios file must contain an array');

  for (const scenario of scenarios) {
    assert(typeof scenario.name === 'string', 'Interaction scenario is missing a name');
    assert(
      typeof scenario.usageScenario === 'string',
      `Interaction scenario ${scenario.name} is missing usageScenario`,
    );
    assert(typeof scenario.symbolName === 'string', `Interaction scenario ${scenario.name} is missing symbolName`);
    assert(
      Array.isArray(scenario.expectedPreviewIncludes) && scenario.expectedPreviewIncludes.length > 0,
      `Interaction scenario ${scenario.name} must define expectedPreviewIncludes`,
    );
    assert(
      typeof scenario.expectEllipsis === 'boolean',
      `Interaction scenario ${scenario.name} must define expectEllipsis`,
    );
  }
}

function validateVueScenarios() {
  const scenarios = readJson<VueScenarioShape[]>(vueScenariosPath);
  assert(Array.isArray(scenarios), 'Vue SFC scenarios file must contain an array');

  for (const scenario of scenarios) {
    assert(typeof scenario.name === 'string', 'Vue SFC scenario is missing a name');
    assert(typeof scenario.file === 'string', `Vue SFC scenario ${scenario.name} is missing a file`);
    assert(typeof scenario.searchText === 'string', `Vue SFC scenario ${scenario.name} is missing searchText`);
    assert(
      scenario.positionOffset === undefined || typeof scenario.positionOffset === 'number',
      `Vue SFC scenario ${scenario.name} must define numeric positionOffset when provided`,
    );
    assert(typeof scenario.symbolName === 'string', `Vue SFC scenario ${scenario.name} is missing symbolName`);
    assert(
      Array.isArray(scenario.expectedIncludes) && scenario.expectedIncludes.length > 0,
      `Vue SFC scenario ${scenario.name} must define expectedIncludes`,
    );
  }
}

function validateStabilityHooks(source: string) {
  for (const snippet of ['stopListen', 'resetServiceStateForTests', 'requestTimeout', "express.json({ limit:"]) {
    assert(source.includes(snippet), `Service stability smoke guard missing snippet: ${snippet}`);
  }
}

function validateStabilityScenarios() {
  const scenarios = readJson<StabilityScenarioShape[]>(stabilityScenariosPath);
  assert(Array.isArray(scenarios), 'Stability scenarios file must contain an array');

  for (const scenario of scenarios) {
    assert(typeof scenario.name === 'string', 'Stability scenario is missing a name');
    assert(typeof scenario.fixture === 'string', `Stability scenario ${scenario.name} is missing a fixture`);
    assert(typeof scenario.file === 'string', `Stability scenario ${scenario.name} is missing a file`);
    assert(typeof scenario.searchText === 'string', `Stability scenario ${scenario.name} is missing searchText`);
    assert(
      Array.isArray(scenario.expectedIncludes) && scenario.expectedIncludes.length > 0,
      `Stability scenario ${scenario.name} must define expectedIncludes`,
    );
  }
}

function readablePathExists(targetPath: string) {
  return fs.existsSync(targetPath);
}
