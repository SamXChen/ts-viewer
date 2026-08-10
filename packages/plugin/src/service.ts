import {
  PluginGetTypeRoutePath,
  PluginHealthKind,
  PluginHealthRoutePath,
  PluginLoopbackHost,
  createErrorResponse,
  getErrorMessage,
  type GetTypeRequest,
  type GetTypeResponse,
  type PluginConfig,
  type PluginHealthResponse,
} from '@ts-viewer/shared';
import express from 'express';
import * as http from 'http';

import { server as tsServer } from 'typescript/lib/tsserverlibrary';

import ts from 'typescript';
import { ExpiringCache } from './utils/expiring-cache';
import { normalizeFsPath, isPathInside } from './utils/path';
import { findNode } from './utils/syntax';
import { resolveTypeStringAtNode } from './utils/type-resolve';
import { resolveVueTypeInfo } from './vue';

const createdInfoMap = new Map<string, tsServer.PluginCreateInfo>();

const HttpStatusOk = 200;
const JsonBodyLimit = '32kb';
const TypeInfoCacheTtlMs = 1000;
const TypeInfoCacheMaxSize = 64;
const ServerKeepAliveTimeoutMs = 1000;
const ServerHeadersTimeoutMs = 2000;
const ServerRequestTimeoutMs = 5000;
const CloseServerTimeoutMs = 3000;
const PortRetryRange = 20;

const typeInfoCache = new ExpiringCache<string, string>({
  ttlMs: TypeInfoCacheTtlMs,
  maxSize: TypeInfoCacheMaxSize,
});

export function setCreatedInfo(info: tsServer.PluginCreateInfo) {
  const currentDir = normalizeFsPath(info.project.getCurrentDirectory());
  info.project.projectService.logger.info(
    `[ts-viewer:create-info] current directory: ${currentDir}`,
  );
  setPluginConfig(info.config as Partial<PluginConfig> | undefined);
  pruneCreatedInfoMap();
  createdInfoMap.set(currentDir, info);
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
  // Intentional promise-chain queuing pattern to serialize stop operations
  restartPromise = restartPromise
    .catch(() => undefined)
    .then(async () => {
      clearTypeInfoCache();
      await closeServer();
    })
    .catch((error) => {
      // console.error: tsServer logger not accessible in module-level scheduling
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
  // Intentional promise-chain queuing pattern to serialize listen operations
  restartPromise = restartPromise
    .catch(() => undefined)
    .then(() => ensureListening(port))
    .catch((error) => {
      const code = (error as { code?: string })?.code ?? 'UNKNOWN';
      // console.error: tsServer logger not accessible in module-level scheduling
      console.error(`[ts-viewer] failed to listen on port ${port} (${code}):`, error);
    });

  return restartPromise;
}

async function ensureListening(port: number) {
  if (serverState?.port === port && serverState.server.listening) {
    return;
  }

  const currentPort = serverState?.port ?? 'none';
  console.log(
    `[ts-viewer:server] ensureListening port=${port} (current=${currentPort}, listening=${
      serverState?.server.listening ?? false
    })`,
  );
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
    const timer = setTimeout(() => {
      // 超时保护：避免挂起连接阻塞 restartPromise 链
      currentServer.closeAllConnections?.();
      resolve();
    }, CloseServerTimeoutMs);
    currentServer.close((error) => {
      clearTimeout(timer);
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function createServer(startPort: number) {
  const app = createApp();

  return new Promise<{ port: number; server: http.Server }>((resolve, reject) => {
    const tryListen = (attemptPort: number) => {
      const nextServer = app.listen(attemptPort, PluginLoopbackHost);
      const onStartError = (error: Error) => {
        nextServer.off('listening', onListening);
        const code = (error as { code?: string })?.code;
        if (code === 'EADDRINUSE' && attemptPort < startPort + PortRetryRange) {
          console.log(`[ts-viewer:server] port ${attemptPort} in use, retrying ${attemptPort + 1}`);
          tryListen(attemptPort + 1);
          return;
        }
        reject(error);
      };
      const onListening = () => {
        nextServer.off('error', onStartError);
        console.log(`[ts-viewer] listening on port ${attemptPort}`);
        resolve({
          port: attemptPort,
          server: nextServer,
        });
      };

      nextServer.once('error', onStartError);
      nextServer.once('listening', onListening);
      nextServer.keepAliveTimeout = ServerKeepAliveTimeoutMs;
      nextServer.headersTimeout = ServerHeadersTimeoutMs;
      nextServer.requestTimeout = ServerRequestTimeoutMs;
      nextServer.on('error', (error) => {
        const code = (error as { code?: string })?.code ?? 'UNKNOWN';
        // console.error: tsServer logger not accessible in server event handler
        console.error(
          `[ts-viewer:server] runtime error on port ${attemptPort} (code=${code}, listening=${nextServer.listening}):`,
          error,
        );
      });
      nextServer.on('close', () => {
        const isExpected = serverState?.server !== nextServer;
        console.log(
          `[ts-viewer:server] server closed on port ${attemptPort} (expected=${isExpected}, listening=${nextServer.listening})`,
        );
      });
    };

    tryListen(startPort);
  });
}

function createApp() {
  const app = express();
  app.use(express.json({ limit: JsonBodyLimit }));

  app.get(PluginHealthRoutePath, (_req, res) => {
    res.status(HttpStatusOk).json(createHealthResponse());
  });

  app.post(
    PluginGetTypeRoutePath,
    (req: express.Request<unknown, GetTypeResponse, GetTypeRequest>, res) => {
      try {
        if (!isGetTypeRequest(req.body)) {
          res.status(HttpStatusOk).json(createErrorResponse('Invalid request body'));
          return;
        }

        const typeInfoString = resolveTypeString(req.body);
        res.status(HttpStatusOk).json(createSuccessResponse(typeInfoString));
      } catch (err) {
        logError(req.body?.fileName, err);
        res.status(HttpStatusOk).json(createErrorResponse(err));
      }
    },
  );

  // 兜底：任何 handler 抛异常都返回 200 + error JSON，避免 axios ERR_BAD_RESPONSE
  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      void _next;
      logError(undefined, err);
      res.status(HttpStatusOk).json(createErrorResponse(err));
    },
  );

  return app;
}

function resolveTypeString(request: GetTypeRequest): string {
  const info = getMatchedInfo(request.fileName);
  const logger = info.project.projectService.logger;

  logger.info(`[ts-viewer:request] ${request.fileName}, ${request.position}`);

  if (request.fileName.endsWith('.vue')) {
    return resolveVueTypeInfo(info, request, logger);
  }

  const program = info.languageService.getProgram();
  if (!program) {
    throw new Error('program not found');
  }

  logger.info(`[ts-viewer:request] current directory: ${program.getCurrentDirectory()}`);

  const cacheKey = getTypeCacheKey(program, request);
  const cachedTypeInfo = getCachedTypeInfo(cacheKey);
  if (cachedTypeInfo) {
    logger.info(`[ts-viewer:request] cache hit: ${request.fileName}, ${request.position}`);
    return cachedTypeInfo;
  }

  const typeChecker = program.getTypeChecker();
  const sourceFile = program.getSourceFile(request.fileName);
  if (!sourceFile) {
    throw new Error('sourceFile not found');
  }
  logger.info(`[ts-viewer:request] source file: ${sourceFile.fileName}`);

  const node = findNode(sourceFile, request.position);
  if (!node) {
    throw new Error('node not found');
  }
  logger.info(`[ts-viewer:request] node kind: ${ts.SyntaxKind[node.kind]}`);

  const typeInfoString = resolveTypeStringAtNode(typeChecker, node);
  if (!typeInfoString) {
    throw new Error('type info not found');
  }

  setCachedTypeInfo(cacheKey, typeInfoString);
  logger.info(`[ts-viewer:request] type info length: ${typeInfoString.length}`);

  return typeInfoString;
}

function logError(fileName: string | undefined, err: unknown) {
  const errorMessage = getErrorMessage(err);
  try {
    const errorInfo = getMatchedInfo(fileName ?? '');
    errorInfo.project.projectService.logger.info(`[ts-viewer:error] ${errorMessage}`);
  } catch {
    // logger unavailable
  }
  // console.error: fallback when tsServer logger is not accessible
  console.error('[ts-viewer]', err);
}

function getMatchedInfo(fileName: string) {
  throttledPrune();

  const normalizedFileName = normalizeFsPath(fileName);
  let directMatch: tsServer.PluginCreateInfo | undefined;
  let directMatchLength = 0;
  let pathMatch: tsServer.PluginCreateInfo | undefined;
  let pathMatchLength = 0;

  for (const [key, info] of createdInfoMap.entries()) {
    let program: ts.Program | undefined;
    try {
      program = info.languageService.getProgram();
    } catch {
      // 失效条目：跳过，由 pruneCreatedInfoMap 后续清理
      program = undefined;
    }
    if (!program) {
      continue;
    }

    if (program.getSourceFile(fileName) && key.length > directMatchLength) {
      directMatch = info;
      directMatchLength = key.length;
    }

    if (isPathInside(normalizedFileName, key) && key.length > pathMatchLength) {
      pathMatch = info;
      pathMatchLength = key.length;
    }
  }

  const result = directMatch ?? pathMatch;
  if (!result) {
    const keys = [...createdInfoMap.keys()];
    const programStates = keys.map((key) => {
      const info = createdInfoMap.get(key);
      let programAlive = false;
      try {
        programAlive = !!info?.languageService.getProgram();
      } catch {
        programAlive = false;
      }
      return `${key}(program=${programAlive})`;
    });
    throw new Error(
      `info not found for "${fileName}" (entries=${createdInfoMap.size}: [${programStates.join(
        ', ',
      )}])`,
    );
  }
  return result;
}

const PruneIntervalMs = 5000;
let lastPruneAt = 0;

function throttledPrune() {
  const now = Date.now();
  if (now - lastPruneAt < PruneIntervalMs) {
    return;
  }
  lastPruneAt = now;
  pruneCreatedInfoMap();
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

let currentPluginConfig: Partial<PluginConfig> | undefined;

export function setPluginConfig(config: Partial<PluginConfig> | undefined) {
  currentPluginConfig = config;
}

function createHealthResponse(): PluginHealthResponse {
  pruneCreatedInfoMap();
  return {
    kind: PluginHealthKind,
    port: serverState?.port ?? 0,
    projectCount: createdInfoMap.size,
    instanceId: currentPluginConfig?.instanceId,
  };
}

function getTypeCacheKey(program: ts.Program, request: GetTypeRequest) {
  const sourceFile = program.getSourceFile(request.fileName);
  const sourceFileVersion =
    (sourceFile as { version?: string } | undefined)?.version ??
    (sourceFile ? String(sourceFile.text.length) : '0');
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
  const sizeBefore = createdInfoMap.size;
  const removedKeys: string[] = [];
  for (const [key, info] of createdInfoMap.entries()) {
    let programAlive = false;
    try {
      programAlive = !!info.languageService.getProgram();
    } catch {
      // languageService 已失效（tsserver 内部 program 数据损坏），视为死亡条目
      programAlive = false;
    }
    if (!programAlive) {
      removedKeys.push(key);
      createdInfoMap.delete(key);
    }
  }
  if (removedKeys.length > 0) {
    console.log(
      `[ts-viewer:prune] removed ${removedKeys.length}/${sizeBefore} entries (remaining=${
        createdInfoMap.size
      }): ${removedKeys.join(', ')}`,
    );
  }
}
