import type { GetTypeRequest, GetTypeResponse, PluginHealthResponse } from '@ts-viewer/shared';
import express from 'express';
import * as http from 'http';

import { server as tsServer, Node } from 'typescript/lib/tsserverlibrary';

import * as ts from 'typescript';

const createdInfoMap = new Map<string, tsServer.PluginCreateInfo>();

const TypeCacheTtlMs = 1000;
const MaxTypeCacheSize = 64;
const typeInfoCache = new Map<string, { expiresAt: number; value: string }>();

export function setCreatedInfo(info: tsServer.PluginCreateInfo) {
  const currentDir = info.project.getCurrentDirectory();
  info.project.projectService.logger.info(
    `[TS-Viewer][Create-Info][Current-Directory] ${currentDir}`,
  );
  createdInfoMap.set(currentDir, info);
}

function getMatchedInfo(fileName: string) {
  let result: tsServer.PluginCreateInfo | undefined;
  let lastMatchedLength = 0;

  for (const [key, value] of createdInfoMap.entries()) {
    if (fileName.startsWith(key) && key.length > lastMatchedLength) {
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
    const nextServer = app.listen(port);
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
    nextServer.on('error', (error) => {
      if (nextServer.listening) {
        console.error(error);
      }
    });
  });
}

function createApp() {
  const app = express();
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json(createHealthResponse());
  });

  app.post('/get-type', (req: express.Request<unknown, GetTypeResponse, GetTypeRequest>, res) => {
    try {
      if (!isGetTypeRequest(req.body)) {
        res.status(200).json(createErrorResponse('Invalid request body'));
        return;
      }

      const request = req.body;
      const info = getMatchedInfo(request.fileName);

      const logger = info.project.projectService.logger;

      logger.info(`[TS-Viewer][File-Name] ${request.fileName}, ${request.position}`);

      const program = info.languageService.getProgram();

      const typeChecker = program?.getTypeChecker();

      const sourceFile = program?.getSourceFile(request.fileName);

      const currentDirectory = program?.getCurrentDirectory();
      logger.info(`[TS-Viewer][Current-Directory] ${currentDirectory}`);

      if (!sourceFile) {
        throw new Error('sourceFile not found');
      }
      logger.info(`[TS-Viewer][Source-File] ${sourceFile.fileName}`);

      const cacheKey = getTypeCacheKey(sourceFile, request);
      const cachedTypeInfo = getCachedTypeInfo(cacheKey);
      if (cachedTypeInfo) {
        logger.info(`[TS-Viewer][Cache-Hit] ${request.fileName}, ${request.position}`);
        res.status(200).json(createSuccessResponse(cachedTypeInfo));
        return;
      }

      const node = findNode(sourceFile, request.position);
      if (!node) {
        throw new Error('node not found');
      }
      logger.info(`[TS-Viewer][Node-Kind] ${ts.SyntaxKind[node.kind]}`);

      const type = typeChecker?.getTypeAtLocation(node);
      logger.info(`[TS-Viewer][Type] ${type?.flags}`);

      const typeInfoString = typeChecker?.typeToString(
        type!,
        undefined,
        ts.TypeFormatFlags.NoTruncation |
          ts.TypeFormatFlags.NoTypeReduction |
          ts.TypeFormatFlags.InTypeAlias,
      );
      if (!typeInfoString) {
        throw new Error('type info not found');
      }

      setCachedTypeInfo(cacheKey, typeInfoString);
      logger.info(`[TS-Viewer][Type-Info-Length] ${typeInfoString.length}`);

      res.status(200).json(createSuccessResponse(typeInfoString));
    } catch (err) {
      console.error(err);
      res.status(200).json(createErrorResponse(err));
    }
  });

  return app;
}

function findNode(node: Node, position: number): Node | undefined {
  if (node.pos > position || node.end < position) {
    return undefined;
  }

  let childMatch: Node | undefined;
  node.forEachChild((child) => {
    if (childMatch) {
      return;
    }

    if (child.pos > position || child.end < position) {
      return;
    }

    childMatch = findNode(child, position) ?? child;
  });

  return childMatch ?? node;
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
  return {
    kind: 'ts-viewer-health',
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

function getTypeCacheKey(sourceFile: ts.SourceFile, request: GetTypeRequest) {
  const sourceFileVersion = (sourceFile as { version?: string }).version ?? String(sourceFile.text.length);
  return `${request.fileName}:${request.position}:${sourceFileVersion}`;
}

function getCachedTypeInfo(key: string) {
  const cached = typeInfoCache.get(key);
  if (!cached) {
    return undefined;
  }

  if (cached.expiresAt <= Date.now()) {
    typeInfoCache.delete(key);
    return undefined;
  }

  return cached.value;
}

function setCachedTypeInfo(key: string, value: string) {
  pruneTypeInfoCache();

  typeInfoCache.set(key, {
    expiresAt: Date.now() + TypeCacheTtlMs,
    value,
  });

  while (typeInfoCache.size > MaxTypeCacheSize) {
    const firstKey = typeInfoCache.keys().next().value;
    if (!firstKey) {
      break;
    }
    typeInfoCache.delete(firstKey);
  }
}

function pruneTypeInfoCache() {
  const now = Date.now();
  for (const [key, value] of typeInfoCache.entries()) {
    if (value.expiresAt <= now) {
      typeInfoCache.delete(key);
    }
  }
}
