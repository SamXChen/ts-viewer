import {
  PluginGetTypeRoutePath,
  PluginHealthKind,
  PluginHealthRoutePath,
  PluginLoopbackHost,
  type GetTypeRequest,
  type GetTypeResponse,
  type PluginHealthResponse,
} from '@ts-viewer/shared';
import express from 'express';
import * as http from 'http';

import { server as tsServer } from 'typescript/lib/tsserverlibrary';

import * as ts from 'typescript';
import { ExpiringCache } from './utils/expiring-cache';
import { normalizeFsPath, isPathInside } from './utils/path';
import { findNode } from './utils/syntax';
import { TypeFormatFlags } from './utils/type-format';
import { resolveVueTypeInfo } from './vue';

const createdInfoMap = new Map<string, tsServer.PluginCreateInfo>();

const HttpStatusOk = 200;
const JsonBodyLimit = '32kb';
const TypeInfoCacheTtlMs = 1000;
const TypeInfoCacheMaxSize = 64;
const ServerKeepAliveTimeoutMs = 1000;
const ServerHeadersTimeoutMs = 2000;
const ServerRequestTimeoutMs = 5000;

const typeInfoCache = new ExpiringCache<string, string>({
  ttlMs: TypeInfoCacheTtlMs,
  maxSize: TypeInfoCacheMaxSize,
});

export function setCreatedInfo(info: tsServer.PluginCreateInfo) {
  const currentDir = normalizeFsPath(info.project.getCurrentDirectory());
  info.project.projectService.logger.info(
    `[TS-Viewer][Create-Info][Current-Directory] ${currentDir}`,
  );
  createdInfoMap.set(currentDir, info);
}

function getMatchedInfo(fileName: string) {
  pruneCreatedInfoMap();

  const directMatch = getDirectSourceFileMatch(fileName);
  if (directMatch) {
    return directMatch;
  }

  const normalizedFileName = normalizeFsPath(fileName);
  let result: tsServer.PluginCreateInfo | undefined;
  let lastMatchedLength = 0;

  for (const [key, value] of createdInfoMap.entries()) {
    if (isPathInside(normalizedFileName, key) && key.length > lastMatchedLength) {
      result = value;
      lastMatchedLength = key.length;
    }
  }
  if (!result) {
    throw new Error('info not found');
  }
  return result;
}

let serverState: { port: number; server: http.Server } | undefined;
let restartPromise: Promise<void> = Promise.resolve();

export function startListen(port: number) {
  return scheduleListen(port);
}

export function restartListen(port: number) {
  return scheduleListen(port);
}

export function stopListen() {
  restartPromise = restartPromise
    .catch(() => undefined)
    .then(async () => {
      clearTypeInfoCache();
      await closeServer();
    })
    .catch((error) => {
      console.error(error);
    });

  return restartPromise;
}

export function resetServiceStateForTests() {
  createdInfoMap.clear();
  clearTypeInfoCache();
  return stopListen();
}

function scheduleListen(port: number) {
  restartPromise = restartPromise
    .catch(() => undefined)
    .then(() => ensureListening(port))
    .catch((error) => {
      console.error(error);
    });

  return restartPromise;
}

async function ensureListening(port: number) {
  if (serverState?.port === port && serverState.server.listening) {
    return;
  }

  clearTypeInfoCache();
  await closeServer();
  serverState = await createServer(port);
}

async function closeServer() {
  const currentServer = serverState?.server;
  serverState = undefined;
  if (!currentServer) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    currentServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function createServer(port: number) {
  const app = createApp();

  return new Promise<{ port: number; server: http.Server }>((resolve, reject) => {
    const nextServer = app.listen(port, PluginLoopbackHost);
    const onStartError = (error: Error) => {
      nextServer.off('listening', onListening);
      reject(error);
    };
    const onListening = () => {
      nextServer.off('error', onStartError);
      console.log(`[TS-Viewer] Listening on port ${port}`);
      resolve({
        port,
        server: nextServer,
      });
    };

    nextServer.once('error', onStartError);
    nextServer.once('listening', onListening);
    nextServer.keepAliveTimeout = ServerKeepAliveTimeoutMs;
    nextServer.headersTimeout = ServerHeadersTimeoutMs;
    nextServer.requestTimeout = ServerRequestTimeoutMs;
    nextServer.on('error', (error) => {
      if (nextServer.listening) {
        console.error(error);
      }
    });
  });
}

function createApp() {
  const app = express();
  app.use(express.json({ limit: JsonBodyLimit }));

  app.get(PluginHealthRoutePath, (_req, res) => {
    res.status(HttpStatusOk).json(createHealthResponse());
  });

  app.post(PluginGetTypeRoutePath, (req: express.Request<unknown, GetTypeResponse, GetTypeRequest>, res) => {
    try {
      if (!isGetTypeRequest(req.body)) {
        res.status(HttpStatusOk).json(createErrorResponse('Invalid request body'));
        return;
      }

      const request = req.body;
      const info = getMatchedInfo(request.fileName);

      const logger = info.project.projectService.logger;

      logger.info(`[TS-Viewer][File-Name] ${request.fileName}, ${request.position}`);

      const program = info.languageService.getProgram();
      if (!program) {
        throw new Error('program not found');
      }

      const currentDirectory = program.getCurrentDirectory();
      logger.info(`[TS-Viewer][Current-Directory] ${currentDirectory}`);

      const cacheKey = getTypeCacheKey(program, request);
      const cachedTypeInfo = getCachedTypeInfo(cacheKey);
      if (cachedTypeInfo) {
        logger.info(`[TS-Viewer][Cache-Hit] ${request.fileName}, ${request.position}`);
        res.status(HttpStatusOk).json(createSuccessResponse(cachedTypeInfo));
        return;
      }

      let typeInfoString = '';

      if (request.fileName.endsWith('.vue')) {
        logger.info(`[TS-Viewer][Vue-SFC] ${request.fileName}`);
        typeInfoString = resolveVueTypeInfo(program, request);
      } else {
        const typeChecker = program.getTypeChecker();
        const sourceFile = program.getSourceFile(request.fileName);

        if (!sourceFile) {
          throw new Error('sourceFile not found');
        }
        logger.info(`[TS-Viewer][Source-File] ${sourceFile.fileName}`);

        const node = findNode(sourceFile, request.position);
        if (!node) {
          throw new Error('node not found');
        }
        logger.info(`[TS-Viewer][Node-Kind] ${ts.SyntaxKind[node.kind]}`);

        const type = typeChecker.getTypeAtLocation(node);
        logger.info(`[TS-Viewer][Type] ${type?.flags}`);

        typeInfoString = typeChecker.typeToString(type, undefined, TypeFormatFlags);
      }
      if (!typeInfoString) {
        throw new Error('type info not found');
      }

      setCachedTypeInfo(cacheKey, typeInfoString);
      logger.info(`[TS-Viewer][Type-Info-Length] ${typeInfoString.length}`);

      res.status(HttpStatusOk).json(createSuccessResponse(typeInfoString));
    } catch (err) {
      console.error(err);
      res.status(HttpStatusOk).json(createErrorResponse(err));
    }
  });

  return app;
}

function isGetTypeRequest(input: unknown): input is GetTypeRequest {
  if (!input || typeof input !== 'object') {
    return false;
  }

  const candidate = input as Partial<GetTypeRequest>;
  return typeof candidate.fileName === 'string' && typeof candidate.position === 'number';
}

function createSuccessResponse(data: string): GetTypeResponse {
  return {
    type: 'success',
    data,
  };
}

function createHealthResponse(): PluginHealthResponse {
  pruneCreatedInfoMap();
  return {
    kind: PluginHealthKind,
    port: serverState?.port ?? 0,
    projectCount: createdInfoMap.size,
  };
}

function createErrorResponse(error: unknown): GetTypeResponse {
  return {
    type: 'error',
    data: error instanceof Error ? error.message : String(error),
  };
}

function getTypeCacheKey(program: ts.Program, request: GetTypeRequest) {
  const sourceFile = program.getSourceFile(request.fileName);
  const sourceFileVersion =
    (sourceFile as { version?: string } | undefined)?.version ??
    (sourceFile ? String(sourceFile.text.length) : String(ts.sys.readFile(request.fileName)?.length ?? 0));
  return `${request.fileName}:${request.position}:${sourceFileVersion}`;
}

function getCachedTypeInfo(key: string) {
  return typeInfoCache.get(key);
}

function setCachedTypeInfo(key: string, value: string) {
  typeInfoCache.set(key, value);
}

function clearTypeInfoCache() {
  typeInfoCache.clear();
}

function pruneCreatedInfoMap() {
  for (const [key, info] of createdInfoMap.entries()) {
    const program = info.languageService.getProgram();
    if (!program) {
      createdInfoMap.delete(key);
    }
  }
}

function getDirectSourceFileMatch(fileName: string) {
  let result: tsServer.PluginCreateInfo | undefined;
  let lastMatchedLength = 0;

  for (const [key, info] of createdInfoMap.entries()) {
    const program = info.languageService.getProgram();
    if (!program?.getSourceFile(fileName)) {
      continue;
    }

    if (key.length > lastMatchedLength) {
      result = info;
      lastMatchedLength = key.length;
    }
  }

  return result;
}
