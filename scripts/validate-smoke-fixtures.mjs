import fs from 'fs';
import path from 'path';

const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');

const extensionManifestPath = path.join(repoRoot, 'packages', 'extension', 'package.json');
const selectorsPath = path.join(repoRoot, 'packages', 'extension', 'src', 'constants.ts');
const connectionPath = path.join(repoRoot, 'packages', 'extension', 'src', 'connection.ts');
const servicePath = path.join(repoRoot, 'packages', 'plugin', 'src', 'service.ts');
const fixturesRoot = path.join(repoRoot, 'tests', 'fixtures');
const scenariosPath = path.join(fixturesRoot, 'usage-scenarios.json');
const interactionScenariosPath = path.join(fixturesRoot, 'interaction-scenarios.json');
const typeInfoPath = path.join(repoRoot, 'packages', 'extension', 'src', 'type-info.ts');

const expectedFixtures = [
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
    files: ['tsconfig.json', 'src/App.vue', 'src/vue-shim.d.ts'],
    snippets: [['src/App.vue', 'const props = defineProps<Props>()']],
  },
];

main();

function main() {
  const manifest = readJson(extensionManifestPath);
  const selectorsSource = readText(selectorsPath);
  const connectionSource = readText(connectionPath);
  const serviceSource = readText(servicePath);
  const typeInfoSource = readText(typeInfoPath);

  validateManifest(manifest);
  validateSelectors(selectorsSource);
  validateConnectionSource(connectionSource);
  validateServiceSource(serviceSource);
  validateTypeInfoSource(typeInfoSource);
  validateFixtures();
  validateUsageScenarios();
  validateInteractionScenarios();

  console.log('Smoke fixture validation passed.');
}

function validateManifest(manifest) {
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

function validateSelectors(source) {
  for (const selector of ['typescript', 'typescriptreact', 'javascript', 'javascriptreact', 'vue']) {
    assert(source.includes(`'${selector}'`), `Missing selector: ${selector}`);
  }
}

function validateConnectionSource(source) {
  for (const snippet of [
    "waitForHealthy",
    "probeForSupportedDocument",
    "workspace folders changed",
    "supported document opened",
    "existing port",
  ]) {
    assert(source.includes(snippet), `Connection smoke guard missing snippet: ${snippet}`);
  }
}

function validateServiceSource(source) {
  for (const snippet of [
    "app.get('/health'",
    'pruneCreatedInfoMap',
    'getDirectSourceFileMatch',
    'normalizeFsPath',
    'clearTypeInfoCache',
  ]) {
    assert(source.includes(snippet), `Plugin service smoke guard missing snippet: ${snippet}`);
  }
}

function validateTypeInfoSource(source) {
  for (const snippet of [
    'createTypeInfoPayload',
    'createPreview',
    'toViewRequest',
    'PreviewMaxLines',
  ]) {
    assert(source.includes(snippet), `Type-info smoke guard missing snippet: ${snippet}`);
  }
}

function validateFixtures() {
  for (const fixture of expectedFixtures) {
    const fixtureRoot = path.join(fixturesRoot, fixture.name);
    assert(fs.existsSync(fixtureRoot), `Missing fixture directory: ${fixture.name}`);

    for (const relativeFile of fixture.files) {
      const absoluteFile = path.join(fixtureRoot, relativeFile);
      assert(fs.existsSync(absoluteFile), `Missing fixture file: ${fixture.name}/${relativeFile}`);
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
  const scenarios = readJson(scenariosPath);
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
  const scenarios = readJson(interactionScenariosPath);
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

function readJson(filePath) {
  return JSON.parse(readText(filePath));
}

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
