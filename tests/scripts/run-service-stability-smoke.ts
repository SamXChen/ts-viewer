import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import ts from 'typescript';
import { assert, fixturesRoot, readJson, repoRoot } from './lib/fixture-smoke';
import {
  pluginSourceRoot,
  pluginUtilitySourcePaths,
  serviceSourcePath,
} from './lib/plugin-runtime';
import { requireTranspiledModuleGraph } from './lib/transpile-module';

interface StabilityScenario {
  expectedIncludes: string[];
  file: string;
  fixture: string;
  name: string;
  searchText: string;
}

interface ServiceModule {
  resetServiceStateForTests(): Promise<void>;
  restartListen(port: number): Promise<void>;
  setCreatedInfo(info: unknown): void;
  startListen(port: number): Promise<void>;
}

const LoopbackHost = '127.0.0.1';
const GetTypeRoutePath = '/get-type';
const StabilityFixtureNames = ['typescript-workspace'] as const;

void main();

async function main() {
  const scenarios = readJson<StabilityScenario[]>(
    path.join(fixturesRoot, 'stability-scenarios.json'),
  );
  const serviceModule = await loadServiceModule();
  const fixturePrograms = createFixturePrograms();

  try {
    await serviceModule.resetServiceStateForTests();

    for (const scenario of scenarios) {
      const program = fixturePrograms.get(scenario.fixture);
      assert(program, `Missing program for stability fixture: ${scenario.fixture}`);
      serviceModule.setCreatedInfo(createPluginInfo(program, scenario.fixture));
    }

    const firstPort = await getAvailablePort();
    await serviceModule.startListen(firstPort);

    for (const scenario of scenarios) {
      const firstResponse = await requestTypeInfo(firstPort, scenario);
      assert(
        firstResponse.type === 'success',
        `Initial request failed for ${scenario.name}: ${firstResponse.data}`,
      );
      for (const expectedText of scenario.expectedIncludes) {
        assert(
          String(firstResponse.data).includes(expectedText),
          `Initial response for ${scenario.name} is missing text: ${expectedText}\nActual:\n${firstResponse.data}`,
        );
      }
    }

    const secondPort = await getAvailablePort(firstPort);
    await serviceModule.restartListen(secondPort);

    const stalePortResponse = await requestOldPortFailure(firstPort, scenarios[0]);
    assert(stalePortResponse === true, 'Old port should stop accepting requests after restart');

    for (const scenario of scenarios) {
      const secondResponse = await requestTypeInfo(secondPort, scenario);
      assert(
        secondResponse.type === 'success',
        `Restarted request failed for ${scenario.name}: ${secondResponse.data}`,
      );
      for (const expectedText of scenario.expectedIncludes) {
        assert(
          String(secondResponse.data).includes(expectedText),
          `Restarted response for ${scenario.name} is missing text: ${expectedText}\nActual:\n${secondResponse.data}`,
        );
      }
    }
  } finally {
    await serviceModule.resetServiceStateForTests();
  }

  console.log(`Service stability smoke passed for ${scenarios.length} scenario(s).`);
}

async function loadServiceModule() {
  return requireTranspiledModuleGraph<ServiceModule>({
    entrySourcePath: serviceSourcePath,
    sourcePaths: [serviceSourcePath, ...pluginUtilitySourcePaths],
    sourceRoot: pluginSourceRoot,
    tempRoot: path.join(repoRoot, 'packages', 'plugin', '.tmp'),
  });
}

function createFixturePrograms() {
  const map = new Map<string, ts.Program>();
  for (const fixtureName of StabilityFixtureNames) {
    const fixtureRoot = path.join(fixturesRoot, fixtureName);
    const configPath = path.join(fixtureRoot, 'tsconfig.json');
    const readResult = ts.readConfigFile(configPath, ts.sys.readFile);
    if (readResult.error) {
      throw new Error(ts.flattenDiagnosticMessageText(readResult.error.messageText, '\n'));
    }

    const parsed = ts.parseJsonConfigFileContent(
      readResult.config,
      ts.sys,
      path.dirname(configPath),
    );
    if (parsed.errors.length > 0) {
      throw new Error(
        parsed.errors
          .map((error) => ts.flattenDiagnosticMessageText(error.messageText, '\n'))
          .join('\n'),
      );
    }

    map.set(
      fixtureName,
      ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options }),
    );
  }

  return map;
}

function createPluginInfo(program: ts.Program, fixtureName: string) {
  const fixtureRoot = path.join(fixturesRoot, fixtureName);
  return {
    languageService: {
      getProgram: () => program,
    },
    project: {
      getCurrentDirectory: () => fixtureRoot,
      projectService: {
        logger: {
          info: () => undefined,
        },
      },
    },
  };
}

async function requestTypeInfo(port: number, scenario: StabilityScenario) {
  const filePath = path.join(fixturesRoot, scenario.fixture, scenario.file);
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const position = sourceText.indexOf(scenario.searchText);
  assert(position >= 0, `Unable to find search text for stability scenario ${scenario.name}`);

  const response = await fetch(`http://${LoopbackHost}:${port}${GetTypeRoutePath}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      fileName: filePath,
      position,
    }),
  });

  return (await response.json()) as { data: unknown; type: string };
}

async function requestOldPortFailure(port: number, scenario: StabilityScenario) {
  try {
    await requestTypeInfo(port, scenario);
    return false;
  } catch {
    return true;
  }
}

async function getAvailablePort(excludedPort?: number): Promise<number> {
  const server = await new Promise<net.Server>((resolve, reject) => {
    const nextServer = net.createServer();
    nextServer.once('error', reject);
    nextServer.listen(0, LoopbackHost, () => resolve(nextServer));
  });

  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise<void>((resolve) => server.close(() => resolve()));

  if (port && port !== excludedPort) {
    return port;
  }

  return getAvailablePort(excludedPort);
}
